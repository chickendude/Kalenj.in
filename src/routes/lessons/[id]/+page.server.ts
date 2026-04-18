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
import { syncExampleSentenceTokens, syncStorySentenceTokens } from '$lib/server/sentence-annotations';
import { normalizeLemma } from '$lib/server/normalize-lemma';
import { prepareAlternativeSpellings } from '$lib/server/kalenjin-word-search';
import type { CefrLevel, Prisma } from '@prisma/client';
import type { Actions, PageServerLoad } from './$types';

function buildWordSelect() {
	return {
		id: true,
		kalenjin: true,
		translations: true,
		notes: true,
		spellings: {
			orderBy: [{ spelling: 'asc' as const }],
			select: {
				id: true,
				spelling: true,
				spellingNormalized: true
			}
		}
	};
}

async function createOrUpdateLinkedWord(
	tx: Prisma.TransactionClient,
	input: {
		wordId?: string | null;
		kalenjin: string;
		translations: string;
		notes?: string | null;
		alternativeSpellings?: string | null;
	}
) {
	const spellings = prepareAlternativeSpellings(input.alternativeSpellings ?? '', input.kalenjin);

	if (input.wordId) {
		return tx.word.update({
			where: { id: input.wordId },
			data: {
				kalenjin: input.kalenjin,
				kalenjinNormalized: normalizeLemma(input.kalenjin),
				translations: input.translations,
				notes: input.notes ?? null,
				spellings: {
					deleteMany: {},
					createMany: spellings.length
						? {
								data: spellings
							}
						: undefined
				}
			},
			select: buildWordSelect()
		});
	}

	return tx.word.create({
		data: {
			kalenjin: input.kalenjin,
			kalenjinNormalized: normalizeLemma(input.kalenjin),
			translations: input.translations,
			notes: input.notes ?? null,
			spellings: spellings.length
				? {
						createMany: {
							data: spellings
						}
					}
				: undefined
		},
		select: buildWordSelect()
	});
}

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

async function ensureStorySentenceToken(storySentenceId: string, tokenId: string): Promise<string> {
	const token = await prisma.storySentenceToken.findUnique({
		where: { id: tokenId },
		select: { storySentenceId: true }
	});

	if (!token || token.storySentenceId !== storySentenceId) {
		error(404, 'Sentence token not found for this story sentence.');
	}

	return tokenId;
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

async function ensureExampleSentenceToken(exampleSentenceId: string, tokenId: string): Promise<string> {
	const token = await prisma.exampleSentenceToken.findUnique({
		where: { id: tokenId },
		select: { exampleSentenceId: true }
	});

	if (!token || token.exampleSentenceId !== exampleSentenceId) {
		error(404, 'Sentence token not found for this lesson word.');
	}

	return tokenId;
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
				storySentence: { select: { id: true, kalenjin: true, sentenceOrder: true } }
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

	const introducedWordIds = new Set(vocabLessonWords.map((lw) => lw.wordId));

	const wordMap = new Map<string, {
		word: { id: string; kalenjin: string; translations: string };
		introduced: boolean;
		sentences: Map<string, { id: string; kalenjin: string; sentenceOrder: number }>;
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

export const load: PageServerLoad = async ({ params }) => {
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

	const [storyWordCoverage, vocabWordCoverage] = await Promise.all([
		getStoryWordCoverage(lesson),
		getVocabWordCoverage(lesson)
	]);

	return {
		lesson,
		words,
		cefrTargets,
		storyWordCoverage,
		vocabWordCoverage,
		lessonTypes: LESSON_TYPES,
		vocabularyTypes: VOCABULARY_LESSON_TYPES
	};
};

export const actions: Actions = {
	updateLesson: async ({ request, params }) => {
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
	deleteLesson: async ({ params }) => {
		await prisma.lesson.delete({
			where: { id: params.id }
		});

		redirect(303, '/lessons');
	},
	createSection: async ({ request, params }) => {
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
	updateSection: async ({ request }) => {
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
	deleteSection: async ({ request }) => {
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
	createWord: async ({ request }) => {
		const formData = await request.formData();
		const lessonId = readText(formData, 'lessonId');
		const wordId = readText(formData, 'wordId');
		const kalenjin = readText(formData, 'kalenjin');
		const translations = readText(formData, 'translations');
		const sentenceKalenjin = readText(formData, 'sentenceKalenjin');
		const sentenceEnglish = readText(formData, 'sentenceEnglish');
		const sentenceSource = readOptionalText(formData, 'sentenceSource');
		const sentenceTranslation = readOptionalText(formData, 'sentenceTranslation');
		const wordForWordTranslation = readOptionalText(formData, 'wordForWordTranslation');
		const notesMarkdown = readOptionalText(formData, 'notesMarkdown');
		const cefrTargetIds = readStringList(formData, 'cefrTargetIds');

		if (!lessonId || (!wordId && (!kalenjin || !translations))) {
			return fail(400, {
				error: 'Lesson, word, and translation are required.'
			});
		}

		try {
			const lessonWord = await prisma.$transaction(async (tx) => {
				const lessonSection = await ensureDefaultLessonSection(tx, lessonId);
				const itemOrder = await getNextLessonWordOrder(tx, lessonId);
				const word = wordId
					? await tx.word.findUnique({ where: { id: wordId }, select: buildWordSelect() })
					: await createOrUpdateLinkedWord(tx, { kalenjin, translations });

				if (!word) {
					throw new Error('Word not found.');
				}

				const sentence = await tx.exampleSentence.create({
					data: {
						kalenjin: sentenceKalenjin,
						english: sentenceEnglish,
						source: sentenceSource
					}
				});

				if (sentenceKalenjin) {
					await syncExampleSentenceTokens(tx, sentence.id, sentenceKalenjin);
				}

				const createdLessonWord = await tx.lessonWord.create({
					data: {
						lessonSectionId: lessonSection.id,
						wordId: word.id,
						itemOrder,
						sentenceId: sentence.id,
						sentenceTranslation,
						wordForWordTranslation,
						notesMarkdown
					}
				});

				return { sentenceId: sentence.id, lessonWordId: createdLessonWord.id, wordId: word.id };
			});

			await ensureWordSentenceLink(lessonWord.wordId, lessonWord.sentenceId);
			await ensureCefrCoverage(lessonWord.lessonWordId, cefrTargetIds);
			return { createWordSuccess: true, createdLessonWordId: lessonWord.lessonWordId };
		} catch (createError) {
			return fail(400, {
				error:
					createError instanceof Error ? createError.message : 'Could not create lesson word.'
			});
		}
	},
	updateWord: async ({ request }) => {
		const formData = await request.formData();
		const id = readText(formData, 'id');
		const wordId = readText(formData, 'wordId');
		const itemOrder = readInteger(formData, 'itemOrder');
		const sentenceSource = readOptionalText(formData, 'sentenceSource');
		const sentenceTranslation = readOptionalText(formData, 'sentenceTranslation');
		const wordForWordTranslation = readOptionalText(formData, 'wordForWordTranslation');

		if (!id || !wordId || itemOrder === null) {
			return fail(400, { error: 'Lesson word id, word, and item order are required.' });
		}

		const existingLessonWord = await prisma.lessonWord.findUnique({
			where: { id },
			select: { sentenceId: true }
		});

		if (!existingLessonWord) {
			return fail(404, { error: 'Lesson word not found.' });
		}

		try {
			await prisma.$transaction(async (tx) => {
				if (sentenceSource !== undefined) {
					await tx.exampleSentence.update({
						where: { id: existingLessonWord.sentenceId },
						data: { source: sentenceSource }
					});
				}
				await tx.lessonWord.update({
					where: { id },
					data: { wordId, itemOrder, sentenceTranslation, wordForWordTranslation }
				});
			});
			await ensureWordSentenceLink(wordId, existingLessonWord.sentenceId);
		} catch (updateError) {
			return fail(400, {
				error:
					updateError instanceof Error ? updateError.message : 'Could not update lesson word.'
			});
		}

		return { updateWordSuccess: true };
	},
	deleteWord: async ({ request }) => {
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
	updateStorySentence: async ({ request }) => {
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
			});
		} catch (updateError) {
			return fail(400, {
				error:
					updateError instanceof Error ? updateError.message : 'Could not update story sentence.'
			});
		}

		return { updateStorySentenceSuccess: true };
	},
	updateStorySentenceToken: async ({ request, params }) => {
		const formData = await request.formData();
		const storySentenceId = readText(formData, 'storySentenceId');
		const tokenId = readText(formData, 'tokenId');
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

		const checkedTokenId = await ensureStorySentenceToken(storySentenceId, tokenId);

		const updatedToken = await prisma.$transaction(async (tx) => {
			return tx.storySentenceToken.update({
				where: { id: checkedTokenId },
				data: {
					wordId,
					inContextTranslation
				},
				include: {
					word: {
						select: buildWordSelect()
					}
				}
			});
		});

		return {
			updateStorySentenceTokenSuccess: true,
			tokenUpdates: [
				{
					tokenId: updatedToken.id,
					wordId: updatedToken.wordId,
					inContextTranslation: updatedToken.inContextTranslation,
					word: updatedToken.word
				}
			]
		};
	},
	createStorySentenceWord: async ({ request, params }) => {
		const formData = await request.formData();
		const storySentenceId = readText(formData, 'storySentenceId');
		const tokenId = readText(formData, 'tokenId');
		const wordId = readOptionalText(formData, 'wordId');
		const kalenjin = readText(formData, 'kalenjin');
		const translations = readText(formData, 'translations');
		const notes = readOptionalText(formData, 'notes');
		const alternativeSpellings = readOptionalText(formData, 'alternativeSpellings');
		const inContextTranslation = readOptionalText(formData, 'inContextTranslation');

		if (!storySentenceId || !tokenId || !kalenjin || !translations) {
			return fail(400, {
				error: 'Sentence token, lemma, and translations are required.'
			});
		}

		const story = await prisma.lesson.findUnique({
			where: { id: params.id },
			select: { storyId: true }
		});

		if (!story?.storyId) {
			return fail(404, { error: 'Story lesson not found.' });
		}

		await ensureStorySentence(story.storyId, storySentenceId);
		const checkedTokenId = await ensureStorySentenceToken(storySentenceId, tokenId);

		try {
			const word = await prisma.$transaction(async (tx) => {
				const word = await createOrUpdateLinkedWord(tx, {
					wordId,
					kalenjin,
					translations,
					notes,
					alternativeSpellings
				});

				await tx.storySentenceToken.update({
					where: { id: checkedTokenId },
					data: {
						wordId: word.id,
						inContextTranslation
					}
				});

				return word;
			});

			return {
				createStorySentenceWordSuccess: true,
				tokenUpdates: [
					{
						tokenId: checkedTokenId,
						wordId: word.id,
						inContextTranslation,
						word
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
	updateExampleSentenceToken: async ({ request }) => {
		const formData = await request.formData();
		const lessonWordId = readText(formData, 'lessonWordId');
		const tokenId = readText(formData, 'tokenId');
		const wordId = readOptionalText(formData, 'wordId');
		const inContextTranslation = readOptionalText(formData, 'inContextTranslation');

		if (!lessonWordId || !tokenId) {
			return fail(400, { error: 'Lesson word and token are required.' });
		}

		const { sentenceId } = await ensureExampleSentenceForLessonWord(lessonWordId, tokenId);
		const checkedTokenId = await ensureExampleSentenceToken(sentenceId, tokenId);

		const updatedToken = await prisma.$transaction(async (tx) => {
			const updatedToken = await tx.exampleSentenceToken.update({
				where: { id: checkedTokenId },
				data: {
					wordId,
					inContextTranslation
				},
				include: {
					word: {
						select: buildWordSelect()
					}
				}
			});

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
					word: updatedToken.word
				}
			]
		};
	},
	createExampleSentenceWord: async ({ request }) => {
		const formData = await request.formData();
		const lessonWordId = readText(formData, 'lessonWordId');
		const tokenId = readText(formData, 'tokenId');
		const wordId = readOptionalText(formData, 'wordId');
		const kalenjin = readText(formData, 'kalenjin');
		const translations = readText(formData, 'translations');
		const notes = readOptionalText(formData, 'notes');
		const alternativeSpellings = readOptionalText(formData, 'alternativeSpellings');
		const inContextTranslation = readOptionalText(formData, 'inContextTranslation');

		if (!lessonWordId || !tokenId || !kalenjin || !translations) {
			return fail(400, {
				error: 'Sentence token, lemma, and translations are required.'
			});
		}

		const { sentenceId } = await ensureExampleSentenceForLessonWord(lessonWordId, tokenId);
		const checkedTokenId = await ensureExampleSentenceToken(sentenceId, tokenId);

		try {
			const word = await prisma.$transaction(async (tx) => {
				const word = await createOrUpdateLinkedWord(tx, {
					wordId,
					kalenjin,
					translations,
					notes,
					alternativeSpellings
				});

				await tx.exampleSentenceToken.update({
					where: { id: checkedTokenId },
					data: {
						wordId: word.id,
						inContextTranslation
					}
				});

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

				return word;
			});

			return {
				createExampleSentenceWordSuccess: true,
				tokenUpdates: [
					{
						tokenId: checkedTokenId,
						wordId: word.id,
						inContextTranslation,
						word
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
	quickAddWord: async ({ request, params }) => {
		const formData = await request.formData();
		const wordId = readText(formData, 'wordId');

		if (!wordId) {
			return fail(400, { error: 'Word ID is required.' });
		}

		const word = await prisma.word.findUnique({
			where: { id: wordId },
			select: { translations: true }
		});

		try {
			let newSentenceId: string | undefined;
			await prisma.$transaction(async (tx) => {
				const lessonSection = await ensureDefaultLessonSection(tx, params.id);
				const itemOrder = await getNextLessonWordOrder(tx, params.id);
				const sentence = await tx.exampleSentence.create({
					data: { kalenjin: '', english: word?.translations ?? '' }
				});
				newSentenceId = sentence.id;
				await tx.lessonWord.create({
					data: {
						lessonSectionId: lessonSection.id,
						wordId,
						itemOrder,
						sentenceId: sentence.id
					}
				});
			});
			if (newSentenceId) {
				await ensureWordSentenceLink(wordId, newSentenceId);
			}
		} catch (createError: unknown) {
			const msg = createError instanceof Error ? createError.message : '';
			if (msg.includes('Unique constraint')) {
				return { quickAddWordSuccess: true };
			}
			return fail(400, { error: msg || 'Could not add word.' });
		}

		return { quickAddWordSuccess: true };
	}
};
