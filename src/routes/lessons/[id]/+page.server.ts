import { error, fail, redirect } from '@sveltejs/kit';
import { LESSON_TYPES, VOCABULARY_LESSON_TYPES } from '$lib/course';
import {
	parseLessonTypeValue,
	parseVocabularyLessonTypeValue,
	readInteger,
	readOptionalText,
	readStringList,
	readText
} from '$lib/server/course-form';
import { prisma } from '$lib/server/prisma';
import {
	findMatchingExampleSentence,
	formatSentenceInUseError
} from '$lib/server/example-sentence-dedupe';
import { syncExampleSentenceTokens, syncStorySentenceTokens } from '$lib/server/sentence-annotations';
import { replaceObservedWordForm } from '$lib/server/observed-word-forms';
import { syncStorySentenceToCorpus } from '$lib/server/story-sync';
import { requireEditor } from '$lib/server/guards';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { stripWordLinks } from '$lib/word-links';
import {
	buildWordSelect,
	createOrUpdateLinkedWord,
	readPresentTenseFromFormData
} from '$lib/server/lemma-words';
import { loadCefrBrowse } from '$lib/server/cefr-browse';
import { Prisma, type CefrLevel, type PartOfSpeech } from '@prisma/client';
import type { Actions, PageServerLoad } from './$types';

async function ensureCefrCoverage(lessonWordId: string, cefrTargetIds: string[]): Promise<void> {
	const requestedIds = [...new Set(cefrTargetIds)];

	const targets = requestedIds.length
		? await prisma.cefrEnglishTarget.findMany({
				where: { id: { in: requestedIds } },
				select: { id: true, coveredByLessonWordId: true }
			})
		: [];

	if (targets.length !== requestedIds.length) {
		throw new Error('Invalid CEFR target selection.');
	}

	const conflictingTarget = targets.find(
		(target) => target.coveredByLessonWordId && target.coveredByLessonWordId !== lessonWordId
	);

	if (conflictingTarget) {
		throw new Error('One or more CEFR targets are already covered by another lesson word.');
	}

	await prisma.cefrEnglishTarget.updateMany({
		where: {
			coveredByLessonWordId: lessonWordId,
			...(requestedIds.length > 0 ? { id: { notIn: requestedIds } } : {})
		},
		data: {
			coveredByLessonWordId: null
		}
	});

	if (requestedIds.length > 0) {
		await prisma.cefrEnglishTarget.updateMany({
			where: { id: { in: requestedIds } },
			data: { coveredByLessonWordId: lessonWordId }
		});
	}
}

async function ensureWordSentenceLink(wordId: string, exampleSentenceId: string): Promise<void> {
	await prisma.wordSentence.upsert({
		where: {
			wordId_exampleSentenceId: {
				wordId,
				exampleSentenceId
			}
		},
		update: {},
		create: {
			wordId,
			exampleSentenceId
		}
	});
}

function isUniqueConstraintError(error: unknown): boolean {
	return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function ensureDefaultLessonSection(
	tx: Prisma.TransactionClient,
	lessonId: string
): Promise<{ id: string }> {
	const existingSection = await tx.lessonSection.findFirst({
		where: { lessonId },
		orderBy: [{ sectionOrder: 'asc' }, { createdAt: 'asc' }],
		select: { id: true }
	});

	if (existingSection) {
		return existingSection;
	}

	return tx.lessonSection.create({
		data: {
			lessonId,
			sectionOrder: 1
		},
		select: { id: true }
	});
}

async function getNextLessonWordOrder(
	tx: Prisma.TransactionClient,
	lessonId: string
): Promise<number> {
	const lessonWords = await tx.lessonWord.findMany({
		where: {
			lessonSection: {
				lessonId
			}
		},
		select: {
			itemOrder: true
		}
	});

	return lessonWords.length === 0
		? 1
		: Math.max(...lessonWords.map((lessonWord) => lessonWord.itemOrder)) + 1;
}

function temporaryLessonWordOrderUpdates<T extends { id: string; itemOrder: number }>(items: T[]) {
	const temporaryOrderFloor = items.reduce(
		(currentMin, item) => Math.min(currentMin, item.itemOrder),
		0
	) - items.length;
	const firstTemporaryOrder = Math.min(-1, temporaryOrderFloor);

	return items.map((item, index) => ({
		id: item.id,
		itemOrder: firstTemporaryOrder - index
	}));
}

async function ensureStorySentence(
	storyId: string,
	storySentenceId: string
): Promise<void> {
	const sentence = await prisma.storySentence.findUnique({
		where: { id: storySentenceId },
		select: { id: true, storyId: true }
	});

	if (!sentence || sentence.storyId !== storyId) {
		error(404, 'Story sentence not found.');
	}
}

async function ensureStorySentenceToken(
	storySentenceId: string,
	tokenId: string
): Promise<{ id: string; wordId: string | null; normalizedForm: string }> {
	const token = await prisma.storySentenceToken.findUnique({
		where: { id: tokenId },
		select: { id: true, storySentenceId: true, wordId: true, normalizedForm: true }
	});

	if (!token || token.storySentenceId !== storySentenceId) {
		error(404, 'Sentence token not found for this story sentence.');
	}

	return {
		id: token.id,
		wordId: token.wordId,
		normalizedForm: token.normalizedForm
	};
}

async function ensureStorySentenceTokenSegment(
	storySentenceId: string,
	tokenId: string,
	segmentId: string
): Promise<{ id: string; wordId: string | null; normalizedForm: string }> {
	const segment = await prisma.storySentenceTokenSegment.findUnique({
		where: { id: segmentId },
		select: {
			id: true,
			tokenId: true,
			wordId: true,
			normalizedForm: true,
			token: {
				select: { storySentenceId: true }
			}
		}
	});

	if (!segment || segment.tokenId !== tokenId || segment.token.storySentenceId !== storySentenceId) {
		error(404, 'Token segment not found for this story sentence.');
	}

	return {
		id: segment.id,
		wordId: segment.wordId,
		normalizedForm: segment.normalizedForm
	};
}

async function ensureExampleSentenceForLessonWord(
	lessonWordId: string,
	tokenId: string
): Promise<{ sentenceId: string }> {
	const token = await prisma.exampleSentenceToken.findUnique({
		where: { id: tokenId },
		select: {
			id: true,
			exampleSentenceId: true,
			exampleSentence: {
				select: {
					lessonWords: {
						where: { id: lessonWordId },
						select: { id: true }
					}
				}
			}
		}
	});

	if (!token || token.exampleSentence.lessonWords.length === 0) {
		error(404, 'Sentence token not found for this lesson word.');
	}

	return { sentenceId: token.exampleSentenceId };
}

async function ensureExampleSentenceToken(
	exampleSentenceId: string,
	tokenId: string
): Promise<{ id: string; wordId: string | null; normalizedForm: string }> {
	const token = await prisma.exampleSentenceToken.findUnique({
		where: { id: tokenId },
		select: { id: true, exampleSentenceId: true, wordId: true, normalizedForm: true }
	});

	if (!token || token.exampleSentenceId !== exampleSentenceId) {
		error(404, 'Sentence token not found for this lesson word.');
	}

	return {
		id: token.id,
		wordId: token.wordId,
		normalizedForm: token.normalizedForm
	};
}

async function ensureExampleSentenceTokenSegment(
	exampleSentenceId: string,
	tokenId: string,
	segmentId: string
): Promise<{ id: string; wordId: string | null; normalizedForm: string }> {
	const segment = await prisma.exampleSentenceTokenSegment.findUnique({
		where: { id: segmentId },
		select: {
			id: true,
			tokenId: true,
			wordId: true,
			normalizedForm: true,
			token: {
				select: { exampleSentenceId: true }
			}
		}
	});

	if (!segment || segment.tokenId !== tokenId || segment.token.exampleSentenceId !== exampleSentenceId) {
		error(404, 'Token segment not found for this lesson word.');
	}

	return {
		id: segment.id,
		wordId: segment.wordId,
		normalizedForm: segment.normalizedForm
	};
}

async function getLessonDetail(lessonId: string) {
	return prisma.lesson.findUnique({
		where: { id: lessonId },
		include: {
			story: {
				include: {
					sentences: {
						orderBy: { sentenceOrder: 'asc' },
						include: {
							tokens: {
								orderBy: { tokenOrder: 'asc' },
								include: {
									word: {
										include: {
											spellings: {
												orderBy: [{ spelling: 'asc' }]
											}
										}
									},
									segments: {
										orderBy: { segmentOrder: 'asc' },
										include: {
											word: {
												include: {
													spellings: {
														orderBy: [{ spelling: 'asc' }]
													}
												}
											}
										}
									}
								}
							}
						}
					}
				}
			},
			sections: {
				include: {
					words: {
						include: {
							word: true,
							sentence: {
								include: {
									tokens: {
										orderBy: { tokenOrder: 'asc' },
										include: {
											word: {
												include: {
													spellings: {
														orderBy: [{ spelling: 'asc' }]
													}
												}
											},
											segments: {
												orderBy: { segmentOrder: 'asc' },
												include: {
													word: {
														include: {
															spellings: {
																orderBy: [{ spelling: 'asc' }]
															}
														}
													}
												}
											}
										}
									}
								}
							},
							coveredCefrTargets: {
								orderBy: [{ level: 'asc' }, { english: 'asc' }]
							}
						},
						orderBy: [{ itemOrder: 'asc' }, { createdAt: 'asc' }]
					}
				},
				orderBy: { sectionOrder: 'asc' }
			}
		}
	});
}

async function backfillMissingStoryTokens(lessonId: string): Promise<void> {
	const lesson = await prisma.lesson.findUnique({
		where: { id: lessonId },
		select: {
			story: {
				select: {
					sentences: {
						select: {
							id: true,
							kalenjin: true,
							tokens: {
								select: { id: true },
								take: 1
							}
						}
					}
				}
			}
		}
	});

	const sentencesToBackfill =
		lesson?.story?.sentences.filter(
			(sentence) => sentence.kalenjin.trim().length > 0 && sentence.tokens.length === 0
		) ?? [];

	if (sentencesToBackfill.length === 0) {
		return;
	}

	await prisma.$transaction(async (tx) => {
		for (const sentence of sentencesToBackfill) {
			await syncStorySentenceTokens(tx, sentence.id, sentence.kalenjin);
			await syncStorySentenceToCorpus(tx, sentence.id);
		}
	});
}

// orderComparator: 'lt' for story pages (introduced *before* the story),
//                  'lte' for vocab pages (introduced *up to and including* this lesson).
async function buildWordCoverageEntries(
	storyId: string,
	level: CefrLevel,
	introducedUpToOrder: number,
	orderComparator: 'lt' | 'lte'
) {
	const [tokens, vocabLessonWords] = await Promise.all([
		prisma.storySentenceToken.findMany({
			where: {
				wordId: { not: null },
				storySentence: { storyId }
			},
			select: {
				wordId: true,
				word: { select: { id: true, kalenjin: true, translations: true } },
				storySentence: { select: { id: true, kalenjin: true, english: true, sentenceOrder: true } }
			},
			orderBy: [{ storySentence: { sentenceOrder: 'asc' } }, { tokenOrder: 'asc' }]
		}),
		prisma.lessonWord.findMany({
			where: {
				lessonSection: {
					lesson: {
						level,
						type: 'VOCABULARY',
						lessonOrder: { [orderComparator]: introducedUpToOrder }
					}
				}
			},
			select: { wordId: true }
		})
	]);

	const introducedWordIds = new Set(
		vocabLessonWords.map((lw) => lw.wordId).filter((wordId): wordId is string => Boolean(wordId))
	);

	const wordMap = new Map<string, {
		word: { id: string; kalenjin: string; translations: string };
		introduced: boolean;
		sentences: Map<string, { id: string; kalenjin: string; english: string; sentenceOrder: number }>;
	}>();

	for (const token of tokens) {
		if (!token.wordId || !token.word) continue;
		if (!wordMap.has(token.wordId)) {
			wordMap.set(token.wordId, {
				word: token.word,
				introduced: introducedWordIds.has(token.wordId),
				sentences: new Map()
			});
		}
		wordMap.get(token.wordId)!.sentences.set(token.storySentence.id, token.storySentence);
	}

	return [...wordMap.values()]
		.map((entry) => ({
			word: entry.word,
			introduced: entry.introduced,
			sentences: [...entry.sentences.values()].sort((a, b) => a.sentenceOrder - b.sentenceOrder)
		}))
		.sort((a, b) => {
			if (a.introduced !== b.introduced) return a.introduced ? 1 : -1;
			return a.word.kalenjin.localeCompare(b.word.kalenjin);
		});
}

async function getStoryWordCoverage(lesson: {
	type: string;
	level: CefrLevel;
	lessonOrder: number;
	storyId: string | null;
}) {
	if (lesson.type !== 'STORY' || !lesson.storyId) {
		return null;
	}

	return buildWordCoverageEntries(lesson.storyId, lesson.level, lesson.lessonOrder, 'lt');
}

async function getVocabWordCoverage(lesson: {
	type: string;
	level: CefrLevel;
	lessonOrder: number;
}) {
	if (lesson.type !== 'VOCABULARY') {
		return null;
	}

	const nextStoryLesson = await prisma.lesson.findFirst({
		where: {
			level: lesson.level,
			type: 'STORY',
			lessonOrder: { gt: lesson.lessonOrder }
		},
		orderBy: { lessonOrder: 'asc' },
		select: { id: true, title: true, lessonOrder: true, storyId: true }
	});

	if (!nextStoryLesson?.storyId) {
		return null;
	}

	const words = await buildWordCoverageEntries(
		nextStoryLesson.storyId,
		lesson.level,
		lesson.lessonOrder,
		'lte'
	);

	return {
		storyLesson: {
			id: nextStoryLesson.id,
			title: nextStoryLesson.title,
			lessonOrder: nextStoryLesson.lessonOrder
		},
		words
	};
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
	requireEditor(locals);
	await backfillMissingStoryTokens(params.id);

	const [lesson, words, cefrTargets] = await Promise.all([
		getLessonDetail(params.id),
		prisma.word.findMany({
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: 500
		}),
		prisma.cefrEnglishTarget.findMany({
			orderBy: [{ level: 'asc' }, { english: 'asc' }]
		})
	]);

	if (!lesson) {
		error(404, 'Lesson not found');
	}

	const [storyWordCoverage, vocabWordCoverage, cefrBrowse] = await Promise.all([
		getStoryWordCoverage(lesson),
		getVocabWordCoverage(lesson),
		loadCefrBrowse(url.searchParams, lesson.level)
	]);

	return {
		lesson,
		words,
		cefrTargets,
		storyWordCoverage,
		vocabWordCoverage,
		cefrBrowse,
		lessonTypes: LESSON_TYPES,
		vocabularyTypes: VOCABULARY_LESSON_TYPES
	};
};

export const actions: Actions = {
	updateLesson: async ({ request, params, locals}) => {
		requireEditor(locals);
		const formData = await request.formData();
		const title = readText(formData, 'title');
		const lessonOrder = readInteger(formData, 'lessonOrder');
		const type = parseLessonTypeValue(readText(formData, 'type'));
		const vocabularyType = parseVocabularyLessonTypeValue(readText(formData, 'vocabularyType'));
		const grammarMarkdown = readOptionalText(formData, 'grammarMarkdown');

		if (!title || lessonOrder === null || !type) {
			return fail(400, { error: 'Title, lesson order, and type are required.' });
		}

		if (type === 'VOCABULARY' && !vocabularyType) {
			return fail(400, { error: 'Vocabulary lessons must have a vocabulary type.' });
		}

		try {
			await prisma.$transaction(async (tx) => {
				const existingLesson = await tx.lesson.findUnique({
					where: { id: params.id },
					select: { storyId: true, level: true }
				});

				if (!existingLesson) {
					throw new Error('Lesson not found.');
				}

				let nextStoryId: string | null = null;

				if (type === 'STORY') {
					if (existingLesson.storyId) {
						nextStoryId = existingLesson.storyId;
						await tx.story.update({
							where: { id: existingLesson.storyId },
							data: { title }
						});
					} else {
						const createdStory = await tx.story.create({
							data: { title }
						});
						nextStoryId = createdStory.id;
					}
				}

				await tx.lesson.update({
					where: { id: params.id },
					data: {
						title,
						level: existingLesson.level,
						lessonOrder,
						type,
						vocabularyType: type === 'VOCABULARY' ? vocabularyType : null,
						grammarMarkdown: type === 'VOCABULARY' ? grammarMarkdown : null,
						storyId: nextStoryId
					}
				});
			});
		} catch (updateError) {
			return fail(400, {
				error:
					updateError instanceof Error
						? updateError.message
						: 'Could not save lesson changes. Check for duplicate lesson order or story assignment.'
			});
		}

		return { updateLessonSuccess: true };
	},
	deleteLesson: async ({ params, locals }) => {
		requireEditor(locals);
		const lesson = await prisma.lesson.findUnique({
			where: { id: params.id },
			select: {
				storyId: true,
				sections: {
					select: {
						words: { select: { sentenceId: true } }
					}
				}
			}
		});

		if (!lesson) {
			redirect(303, '/lessons');
		}

		const sentenceIds = [
			...new Set(
				lesson.sections.flatMap((section) =>
					section.words.map((word) => word.sentenceId)
				)
			)
		].filter((id): id is string => Boolean(id));
		const { storyId } = lesson;

		await prisma.$transaction(async (tx) => {
			await tx.lesson.delete({ where: { id: params.id } });

			if (sentenceIds.length > 0) {
				const stillReferenced = await tx.lessonWord.findMany({
					where: { sentenceId: { in: sentenceIds } },
					select: { sentenceId: true }
				});
				const stillReferencedIds = new Set(
					stillReferenced.map((lessonWord) => lessonWord.sentenceId)
				);
				const orphanedSentenceIds = sentenceIds.filter(
					(id) => !stillReferencedIds.has(id)
				);

				if (orphanedSentenceIds.length > 0) {
					await tx.exampleSentence.deleteMany({
						where: { id: { in: orphanedSentenceIds } }
					});
				}
			}

			if (storyId) {
				await tx.story.delete({ where: { id: storyId } });
			}
		});

		redirect(303, '/lessons');
	},
	createSection: async ({ request, params, locals}) => {
		requireEditor(locals);
		const formData = await request.formData();
		const title = readOptionalText(formData, 'title');
		const sectionOrder = readInteger(formData, 'sectionOrder');
		const notes = readOptionalText(formData, 'notes');

		if (sectionOrder === null) {
			return fail(400, { error: 'Section order is required.' });
		}

		try {
			await prisma.lessonSection.create({
				data: {
					lessonId: params.id,
					title,
					sectionOrder,
					notes
				}
			});
		} catch (createError) {
			return fail(400, {
				error: 'Could not create section. Check for duplicate section order.'
			});
		}

		return { createSectionSuccess: true };
	},
	updateSection: async ({ request, locals}) => {
		requireEditor(locals);
		const formData = await request.formData();
		const id = readText(formData, 'id');
		const title = readOptionalText(formData, 'title');
		const sectionOrder = readInteger(formData, 'sectionOrder');
		const notes = readOptionalText(formData, 'notes');

		if (!id || sectionOrder === null) {
			return fail(400, { error: 'Section id and order are required.' });
		}

		try {
			await prisma.lessonSection.update({
				where: { id },
				data: {
					title,
					sectionOrder,
					notes
				}
			});
		} catch (updateError) {
			return fail(400, { error: 'Could not update section.' });
		}

		return { updateSectionSuccess: true };
	},
	deleteSection: async ({ request, locals}) => {
		requireEditor(locals);
		const formData = await request.formData();
		const id = readText(formData, 'id');

		if (!id) {
			return fail(400, { error: 'Section id is required.' });
		}

		await prisma.lessonSection.delete({
			where: { id }
		});

		return { deleteSectionSuccess: true };
	},
	createWord: async ({ request, locals}) => {
		requireEditor(locals);
		const formData = await request.formData();
		const lessonId = readText(formData, 'lessonId');
		const existingWordId = readText(formData, 'wordId');
		const kalenjinInput = readText(formData, 'kalenjin');
		const translationsInput = readText(formData, 'translations');
		const alternativeSpellings = readText(formData, 'alternativeSpellings');
		const notes = readText(formData, 'notes');
		const partOfSpeechRaw = readText(formData, 'partOfSpeech');
		const pluralFormRaw = readText(formData, 'pluralForm');
		const sentenceKalenjin = readText(formData, 'sentenceKalenjin');
		const sentenceEnglish = readText(formData, 'sentenceEnglish');
		const sentenceNotes = readOptionalText(formData, 'sentenceNotes');
		const sentenceTranslation = readOptionalText(formData, 'sentenceTranslation');
		const wordForWordTranslation = readOptionalText(formData, 'wordForWordTranslation');
		const notesMarkdown = readOptionalText(formData, 'notesMarkdown');
		const cefrTargetIds = readStringList(formData, 'cefrTargetIds');

		if (!lessonId || !sentenceKalenjin || !sentenceEnglish) {
			return fail(400, {
				error: 'Lesson, sentence text, and sentence translation are required.'
			});
		}

		let existingWord: {
			id: string;
			kalenjin: string;
			translations: string;
		} | null = null;

		if (existingWordId) {
			existingWord = await prisma.word.findUnique({
				where: { id: existingWordId },
				select: { id: true, kalenjin: true, translations: true }
			});
			if (!existingWord) {
				return fail(400, { error: 'Selected lemma no longer exists.' });
			}
		} else if (!kalenjinInput || !translationsInput) {
			return fail(400, {
				error: 'Lemma and translations are required to create a new word.'
			});
		}

		if (partOfSpeechRaw && !isPartOfSpeech(partOfSpeechRaw)) {
			return fail(400, { error: 'Invalid part of speech value.' });
		}

		const partOfSpeech: PartOfSpeech | null = partOfSpeechRaw
			? (partOfSpeechRaw as PartOfSpeech)
			: null;
		const pluralForm =
			(partOfSpeech === 'NOUN' || partOfSpeech === 'ADJECTIVE') && pluralFormRaw
				? pluralFormRaw
				: null;
		const presentTense =
			partOfSpeech === 'VERB' ? readPresentTenseFromFormData(formData) : null;

		try {
			const lessonWord = await prisma.$transaction(async (tx) => {
				const lessonSection = await ensureDefaultLessonSection(tx, lessonId);
				const itemOrder = await getNextLessonWordOrder(tx, lessonId);

				const match = await findMatchingExampleSentence(tx, sentenceKalenjin, sentenceEnglish);
				let sentenceId: string;
				if (match) {
					if (match.lessonWord) {
						throw new Error(formatSentenceInUseError(match.lessonWord));
					}
					sentenceId = match.id;
				} else {
					const sentence = await tx.exampleSentence.create({
						data: {
							kalenjin: sentenceKalenjin,
							english: sentenceEnglish,
							notes: sentenceNotes
						}
					});
					await syncExampleSentenceTokens(tx, sentence.id, sentenceKalenjin);
					sentenceId = sentence.id;
				}

				const word = existingWord
					? existingWord
					: await createOrUpdateLinkedWord(tx, {
							kalenjin: kalenjinInput,
							translations: translationsInput,
							notes: notes || null,
							alternativeSpellings,
							partOfSpeech,
							pluralForm,
							presentTense
						});

				const createdLessonWord = await tx.lessonWord.create({
					data: {
						lessonSectionId: lessonSection.id,
						wordId: word.id,
						kalenjin: word.kalenjin,
						translations: word.translations,
						itemOrder,
						sentenceId,
						sentenceTranslation,
						wordForWordTranslation,
						notesMarkdown
					}
				});

				return { lessonWordId: createdLessonWord.id };
			});

			await ensureCefrCoverage(lessonWord.lessonWordId, cefrTargetIds);
			return { createWordSuccess: true, createdLessonWordId: lessonWord.lessonWordId };
		} catch (createError) {
			if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === 'P2002') {
				return fail(400, {
					error: 'This lemma is already in the lesson.'
				});
			}
			return fail(400, {
				error:
					createError instanceof Error ? createError.message : 'Could not create lesson word.'
			});
		}
	},
	deleteWord: async ({ request, locals}) => {
		requireEditor(locals);
		const formData = await request.formData();
		const id = readText(formData, 'id');

		if (!id) {
			return fail(400, { error: 'Lesson word id is required.' });
		}

		await prisma.lessonWord.delete({
			where: { id }
		});

		return { deleteWordSuccess: true };
	},
	reorderWords: async ({ request, params, locals}) => {
		requireEditor(locals);
		const formData = await request.formData();
		const orderedIdsRaw = readText(formData, 'orderedIds');
		let orderedIds: string[] = [];

		try {
			const parsed = JSON.parse(orderedIdsRaw) as unknown;
			if (Array.isArray(parsed)) {
				orderedIds = parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
			}
		} catch {
			return fail(400, { error: 'Could not read the new word order.' });
		}

		if (orderedIds.length === 0 || new Set(orderedIds).size !== orderedIds.length) {
			return fail(400, { error: 'Word order must include each lesson word once.' });
		}

		const lessonWords = await prisma.lessonWord.findMany({
			where: {
				lessonSection: {
					lessonId: params.id
				}
			},
			select: {
				id: true,
				itemOrder: true
			}
		});

		const lessonWordIds = new Set(lessonWords.map((lessonWord) => lessonWord.id));
		if (
			orderedIds.length !== lessonWords.length ||
			orderedIds.some((id) => !lessonWordIds.has(id))
		) {
			return fail(400, { error: 'Word order does not match this lesson.' });
		}

		try {
			await prisma.$transaction(async (tx) => {
				const lessonSection = await ensureDefaultLessonSection(tx, params.id);

				for (const update of temporaryLessonWordOrderUpdates(lessonWords)) {
					await tx.lessonWord.update({
						where: { id: update.id },
						data: { itemOrder: update.itemOrder }
					});
				}

				for (const [index, id] of orderedIds.entries()) {
					await tx.lessonWord.update({
						where: { id },
						data: {
							// The lesson detail page presents an auto-sectioned flat word list, so
							// persisted order is normalized into the default lesson section.
							lessonSectionId: lessonSection.id,
							itemOrder: index + 1
						}
					});
				}
			});
		} catch (reorderError) {
			return fail(400, {
				error: reorderError instanceof Error ? reorderError.message : 'Could not save word order.'
			});
		}

		return { reorderWordsSuccess: true };
	},
	updateStorySentence: async ({ request, locals}) => {
		requireEditor(locals);
		const formData = await request.formData();
		const id = readText(formData, 'id');
		const speaker = readOptionalText(formData, 'speaker');
		const kalenjin = readText(formData, 'kalenjin');
		const english = readText(formData, 'english');
		const grammarNotes = readOptionalText(formData, 'grammarNotes');

		if (!id || !kalenjin || !english) {
			return fail(400, { error: 'Sentence, text, and translation are required.' });
		}

		const existingSentence = await prisma.storySentence.findUnique({
			where: { id },
			select: { kalenjin: true }
		});

		if (!existingSentence) {
			return fail(404, { error: 'Story sentence not found.' });
		}

		try {
			await prisma.$transaction(async (tx) => {
				await tx.storySentence.update({
					where: { id },
					data: {
						speaker,
						kalenjin,
						english,
						grammarNotes
					}
				});

				if (existingSentence.kalenjin !== kalenjin) {
					await syncStorySentenceTokens(tx, id, kalenjin);
				}

				await syncStorySentenceToCorpus(tx, id);
			});
		} catch (updateError) {
			return fail(400, {
				error:
					updateError instanceof Error ? updateError.message : 'Could not update story sentence.'
			});
		}

		return { updateStorySentenceSuccess: true };
	},
	updateStorySentenceToken: async ({ request, params, locals}) => {
		requireEditor(locals);
		const formData = await request.formData();
		const storySentenceId = readText(formData, 'storySentenceId');
		const tokenId = readText(formData, 'tokenId');
		const segmentId = readOptionalText(formData, 'segmentId');
		const wordId = readOptionalText(formData, 'wordId');
		const inContextTranslation = readOptionalText(formData, 'inContextTranslation');

		if (!storySentenceId || !tokenId) {
			return fail(400, { error: 'Story sentence and token are required.' });
		}

		const story = await prisma.lesson.findUnique({
			where: { id: params.id },
			select: { storyId: true }
		});

		if (!story?.storyId) {
			return fail(404, { error: 'Story lesson not found.' });
		}

		await ensureStorySentence(story.storyId, storySentenceId);

		const checkedToken = await ensureStorySentenceToken(storySentenceId, tokenId);
		const checkedSegment = segmentId
			? await ensureStorySentenceTokenSegment(storySentenceId, checkedToken.id, segmentId)
			: null;

		const updatedToken = await prisma.$transaction(async (tx) => {
			if (checkedSegment) {
				const updatedSegment = await tx.storySentenceTokenSegment.update({
					where: { id: checkedSegment.id },
					data: { wordId },
					select: { wordId: true, normalizedForm: true }
				});
				await replaceObservedWordForm(tx, checkedSegment, updatedSegment);

				const token = await tx.storySentenceToken.findUniqueOrThrow({
					where: { id: checkedToken.id },
					include: {
						word: {
							select: buildWordSelect()
						},
						segments: {
							orderBy: { segmentOrder: 'asc' },
							include: {
								word: {
									select: buildWordSelect()
								}
							}
						}
					}
				});

				await syncStorySentenceToCorpus(tx, storySentenceId);
				return token;
			}

			const token = await tx.storySentenceToken.update({
				where: { id: checkedToken.id },
				data: {
					wordId,
					inContextTranslation
				},
				include: {
					word: {
						select: buildWordSelect()
					},
					segments: {
						orderBy: { segmentOrder: 'asc' },
						include: {
							word: {
								select: buildWordSelect()
							}
						}
					}
				}
			});

			await replaceObservedWordForm(tx, checkedToken, token);
			await syncStorySentenceToCorpus(tx, storySentenceId);
			return token;
		});

		return {
			updateStorySentenceTokenSuccess: true,
			tokenUpdates: [
				{
					tokenId: updatedToken.id,
					wordId: updatedToken.wordId,
					inContextTranslation: updatedToken.inContextTranslation,
					word: updatedToken.word,
					segments: updatedToken.segments
				}
			]
		};
	},
	createStorySentenceWord: async ({ request, params, locals}) => {
		requireEditor(locals);
		const formData = await request.formData();
		const storySentenceId = readText(formData, 'storySentenceId');
		const tokenId = readText(formData, 'tokenId');
		const segmentId = readOptionalText(formData, 'segmentId');
		const wordId = readOptionalText(formData, 'wordId');
		const kalenjin = readText(formData, 'kalenjin');
		const translations = readText(formData, 'translations');
		const notes = readOptionalText(formData, 'notes');
		const alternativeSpellings = readOptionalText(formData, 'alternativeSpellings');
		const inContextTranslation = readOptionalText(formData, 'inContextTranslation');
		const partOfSpeechRaw = readOptionalText(formData, 'partOfSpeech');
		const pluralForm = readOptionalText(formData, 'pluralForm');

		if (!storySentenceId || !tokenId || !kalenjin || !translations) {
			return fail(400, {
				error: 'Sentence token, lemma, and translations are required.'
			});
		}

		if (partOfSpeechRaw && !isPartOfSpeech(partOfSpeechRaw)) {
			return fail(400, { error: 'Invalid part of speech value.' });
		}

		const partOfSpeech: PartOfSpeech | null = partOfSpeechRaw
			? (partOfSpeechRaw as PartOfSpeech)
			: null;

		const story = await prisma.lesson.findUnique({
			where: { id: params.id },
			select: { storyId: true }
		});

		if (!story?.storyId) {
			return fail(404, { error: 'Story lesson not found.' });
		}

		await ensureStorySentence(story.storyId, storySentenceId);
		const checkedToken = await ensureStorySentenceToken(storySentenceId, tokenId);
		const checkedSegment = segmentId
			? await ensureStorySentenceTokenSegment(storySentenceId, checkedToken.id, segmentId)
			: null;

		const presentTense =
			partOfSpeech === 'VERB' ? readPresentTenseFromFormData(formData) : null;

		try {
			const { word, token } = await prisma.$transaction(async (tx) => {
				const word = await createOrUpdateLinkedWord(tx, {
					wordId,
					kalenjin,
					translations,
					notes,
					alternativeSpellings,
					partOfSpeech,
					pluralForm:
						partOfSpeech === 'NOUN' || partOfSpeech === 'ADJECTIVE' ? pluralForm : null,
					presentTense
				});

				if (checkedSegment) {
					const updatedSegment = await tx.storySentenceTokenSegment.update({
						where: { id: checkedSegment.id },
						data: { wordId: word.id },
						select: { wordId: true, normalizedForm: true }
					});
					await replaceObservedWordForm(tx, checkedSegment, updatedSegment);
				} else {
					const updatedStoryToken = await tx.storySentenceToken.update({
						where: { id: checkedToken.id },
						data: {
							wordId: word.id,
							inContextTranslation
						},
						select: { wordId: true, normalizedForm: true }
					});
					await replaceObservedWordForm(tx, checkedToken, updatedStoryToken);
				}

				const token = await tx.storySentenceToken.findUniqueOrThrow({
					where: { id: checkedToken.id },
					include: {
						word: {
							select: buildWordSelect()
						},
						segments: {
							orderBy: { segmentOrder: 'asc' },
							include: {
								word: {
									select: buildWordSelect()
								}
							}
						}
					}
				});

				await syncStorySentenceToCorpus(tx, storySentenceId);

				return { word, token };
			});

			return {
				createStorySentenceWordSuccess: true,
				tokenUpdates: [
					{
						tokenId: checkedToken.id,
						wordId: token.wordId,
						inContextTranslation: token.inContextTranslation,
						word: token.word,
						segments: token.segments
					}
				]
			};
		} catch (createError) {
			return fail(400, {
				error:
					createError instanceof Error ? createError.message : 'Could not create or link lemma.'
			});
		}
	},
	updateExampleSentenceToken: async ({ request, locals}) => {
		requireEditor(locals);
		const formData = await request.formData();
		const lessonWordId = readText(formData, 'lessonWordId');
		const tokenId = readText(formData, 'tokenId');
		const segmentId = readOptionalText(formData, 'segmentId');
		const wordId = readOptionalText(formData, 'wordId');
		const inContextTranslation = readOptionalText(formData, 'inContextTranslation');

		if (!lessonWordId || !tokenId) {
			return fail(400, { error: 'Lesson word and token are required.' });
		}

		const { sentenceId } = await ensureExampleSentenceForLessonWord(lessonWordId, tokenId);
		const checkedToken = await ensureExampleSentenceToken(sentenceId, tokenId);
		const checkedSegment = segmentId
			? await ensureExampleSentenceTokenSegment(sentenceId, checkedToken.id, segmentId)
			: null;

		const updatedToken = await prisma.$transaction(async (tx) => {
			if (checkedSegment) {
				const updatedSegment = await tx.exampleSentenceTokenSegment.update({
					where: { id: checkedSegment.id },
					data: { wordId },
					select: { wordId: true, normalizedForm: true }
				});
				await replaceObservedWordForm(tx, checkedSegment, updatedSegment);

				if (wordId) {
					await tx.wordSentence.upsert({
						where: {
							wordId_exampleSentenceId: {
								wordId,
								exampleSentenceId: sentenceId
							}
						},
						update: {},
						create: {
							wordId,
							exampleSentenceId: sentenceId
						}
					});
				}

				return tx.exampleSentenceToken.findUniqueOrThrow({
					where: { id: checkedToken.id },
					include: {
						word: {
							select: buildWordSelect()
						},
						segments: {
							orderBy: { segmentOrder: 'asc' },
							include: {
								word: {
									select: buildWordSelect()
								}
							}
						}
					}
				});
			}

			const updatedToken = await tx.exampleSentenceToken.update({
				where: { id: checkedToken.id },
				data: {
					wordId,
					inContextTranslation
				},
				include: {
					word: {
						select: buildWordSelect()
					},
					segments: {
						orderBy: { segmentOrder: 'asc' },
						include: {
							word: {
								select: buildWordSelect()
							}
						}
					}
				}
			});

			await replaceObservedWordForm(tx, checkedToken, updatedToken);

			if (wordId) {
				await tx.wordSentence.upsert({
					where: {
						wordId_exampleSentenceId: {
							wordId,
							exampleSentenceId: sentenceId
						}
					},
					update: {},
					create: {
						wordId,
						exampleSentenceId: sentenceId
					}
				});
			}

			return updatedToken;
		});

		return {
			updateExampleSentenceTokenSuccess: true,
			tokenUpdates: [
				{
					tokenId: updatedToken.id,
					wordId: updatedToken.wordId,
					inContextTranslation: updatedToken.inContextTranslation,
					word: updatedToken.word,
					segments: updatedToken.segments
				}
			]
		};
	},
	createExampleSentenceWord: async ({ request, locals}) => {
		requireEditor(locals);
		const formData = await request.formData();
		const lessonWordId = readText(formData, 'lessonWordId');
		const tokenId = readText(formData, 'tokenId');
		const segmentId = readOptionalText(formData, 'segmentId');
		const wordId = readOptionalText(formData, 'wordId');
		const kalenjin = readText(formData, 'kalenjin');
		const translations = readText(formData, 'translations');
		const notes = readOptionalText(formData, 'notes');
		const alternativeSpellings = readOptionalText(formData, 'alternativeSpellings');
		const inContextTranslation = readOptionalText(formData, 'inContextTranslation');
		const partOfSpeechRaw = readOptionalText(formData, 'partOfSpeech');
		const pluralForm = readOptionalText(formData, 'pluralForm');

		if (!lessonWordId || !tokenId || !kalenjin || !translations) {
			return fail(400, {
				error: 'Sentence token, lemma, and translations are required.'
			});
		}

		if (partOfSpeechRaw && !isPartOfSpeech(partOfSpeechRaw)) {
			return fail(400, { error: 'Invalid part of speech value.' });
		}

		const partOfSpeech: PartOfSpeech | null = partOfSpeechRaw
			? (partOfSpeechRaw as PartOfSpeech)
			: null;

		const { sentenceId } = await ensureExampleSentenceForLessonWord(lessonWordId, tokenId);
		const checkedToken = await ensureExampleSentenceToken(sentenceId, tokenId);
		const checkedSegment = segmentId
			? await ensureExampleSentenceTokenSegment(sentenceId, checkedToken.id, segmentId)
			: null;

		const presentTense =
			partOfSpeech === 'VERB' ? readPresentTenseFromFormData(formData) : null;

		try {
			const { word, token } = await prisma.$transaction(async (tx) => {
				const word = await createOrUpdateLinkedWord(tx, {
					wordId,
					kalenjin,
					translations,
					notes,
					alternativeSpellings,
					partOfSpeech,
					pluralForm:
						partOfSpeech === 'NOUN' || partOfSpeech === 'ADJECTIVE' ? pluralForm : null,
					presentTense
				});

				if (checkedSegment) {
					const updatedSegment = await tx.exampleSentenceTokenSegment.update({
						where: { id: checkedSegment.id },
						data: { wordId: word.id },
						select: { wordId: true, normalizedForm: true }
					});
					await replaceObservedWordForm(tx, checkedSegment, updatedSegment);
				} else {
					const updatedSentenceToken = await tx.exampleSentenceToken.update({
						where: { id: checkedToken.id },
						data: {
							wordId: word.id,
							inContextTranslation
						},
						select: { wordId: true, normalizedForm: true }
					});
					await replaceObservedWordForm(tx, checkedToken, updatedSentenceToken);
				}

				await tx.wordSentence.upsert({
					where: {
						wordId_exampleSentenceId: {
							wordId: word.id,
							exampleSentenceId: sentenceId
						}
					},
					update: {},
					create: {
						wordId: word.id,
						exampleSentenceId: sentenceId
					}
				});

				const token = await tx.exampleSentenceToken.findUniqueOrThrow({
					where: { id: checkedToken.id },
					include: {
						word: {
							select: buildWordSelect()
						},
						segments: {
							orderBy: { segmentOrder: 'asc' },
							include: {
								word: {
									select: buildWordSelect()
								}
							}
						}
					}
				});

				return { word, token };
			});

			return {
				createExampleSentenceWordSuccess: true,
				tokenUpdates: [
					{
						tokenId: checkedToken.id,
						wordId: token.wordId,
						inContextTranslation: token.inContextTranslation,
						word: token.word,
						segments: token.segments
					}
				]
			};
		} catch (createError) {
			return fail(400, {
				error:
					createError instanceof Error ? createError.message : 'Could not create or link lemma.'
			});
		}
	},
	quickAddWord: async ({ request, params, locals}) => {
		requireEditor(locals);
		const formData = await request.formData();
		const wordId = readText(formData, 'wordId');

		if (!wordId) {
			return fail(400, { error: 'Word ID is required.' });
		}

		const word = await prisma.word.findUnique({
			where: { id: wordId },
			select: { id: true, kalenjin: true, translations: true }
		});

		if (!word) {
			return fail(404, { error: 'Word not found.' });
		}

		try {
			await prisma.$transaction(async (tx) => {
				const lessonSection = await ensureDefaultLessonSection(tx, params.id);
				const itemOrder = await getNextLessonWordOrder(tx, params.id);

				await tx.lessonWord.create({
					data: {
						lessonSectionId: lessonSection.id,
						wordId: word.id,
						kalenjin: word.kalenjin,
						translations: stripWordLinks(word.translations),
						itemOrder
					}
				});
			});
		} catch (createError: unknown) {
			if (isUniqueConstraintError(createError)) {
				return { quickAddWordSuccess: true };
			}
			const msg = createError instanceof Error ? createError.message : '';
			return fail(400, { error: msg || 'Could not add word.' });
		}

		return { quickAddWordSuccess: true };
	}
};
