import { error, fail, redirect } from '@sveltejs/kit';
import { CEFR_LEVELS, LESSON_TYPES, VOCABULARY_LESSON_TYPES } from '$lib/course';
import {
	parseCefrLevelValue,
	parseLessonTypeValue,
	parseVocabularyLessonTypeValue,
	readInteger,
	readOptionalText,
	readStringList,
	readText
} from '$lib/server/course-form';
import { prisma } from '$lib/server/prisma';
import { parseStoryImportText } from '$lib/server/story-import';
import type { Prisma } from '@prisma/client';
import type { Actions, PageServerLoad } from './$types';

async function syncStorySentences(
	tx: Prisma.TransactionClient,
	storyId: string,
	storyText: string | null
): Promise<void> {
	const sentences = storyText ? parseStoryImportText(storyText) : [];

	await tx.storySentence.deleteMany({
		where: { storyId }
	});

	if (sentences.length === 0) {
		return;
	}

	await tx.storySentence.createMany({
		data: sentences.map((sentence) => ({
			storyId,
			sentenceOrder: sentence.sentenceOrder,
			speaker: sentence.speaker,
			kalenjin: sentence.kalenjin,
			english: sentence.english
		}))
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

export const load: PageServerLoad = async ({ params }) => {
	const [lesson, words, cefrTargets] = await Promise.all([
		prisma.lesson.findUnique({
			where: { id: params.id },
			include: {
				story: {
					include: {
						sentences: {
							orderBy: { sentenceOrder: 'asc' }
						}
					}
				},
				sections: {
					include: {
						words: {
							include: {
								word: true,
								sentence: true,
								coveredCefrTargets: {
									orderBy: [{ level: 'asc' }, { english: 'asc' }]
								}
							},
							orderBy: { itemOrder: 'asc' }
						}
					},
					orderBy: { sectionOrder: 'asc' }
				}
			}
		}),
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

	return {
		lesson,
		words,
		cefrTargets,
		levels: CEFR_LEVELS,
		lessonTypes: LESSON_TYPES,
		vocabularyTypes: VOCABULARY_LESSON_TYPES
	};
};

export const actions: Actions = {
	updateLesson: async ({ request, params }) => {
		const formData = await request.formData();
		const title = readText(formData, 'title');
		const level = parseCefrLevelValue(readText(formData, 'level'));
		const lessonOrder = readInteger(formData, 'lessonOrder');
		const type = parseLessonTypeValue(readText(formData, 'type'));
		const vocabularyType = parseVocabularyLessonTypeValue(readText(formData, 'vocabularyType'));
		const grammarMarkdown = readOptionalText(formData, 'grammarMarkdown');

		if (!title || !level || lessonOrder === null || !type) {
			return fail(400, { error: 'Level, title, lesson order, and type are required.' });
		}

		if (type === 'VOCABULARY' && !vocabularyType) {
			return fail(400, { error: 'Vocabulary lessons must have a vocabulary type.' });
		}

		try {
			await prisma.$transaction(async (tx) => {
				const existingLesson = await tx.lesson.findUnique({
					where: { id: params.id },
					select: { storyId: true }
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
						await syncStorySentences(tx, existingLesson.storyId, grammarMarkdown);
					} else {
						const createdStory = await tx.story.create({
							data: { title }
						});
						nextStoryId = createdStory.id;
						await syncStorySentences(tx, createdStory.id, grammarMarkdown);
					}
				}

				await tx.lesson.update({
					where: { id: params.id },
					data: {
						title,
						level,
						lessonOrder,
						type,
						vocabularyType: type === 'VOCABULARY' ? vocabularyType : null,
						grammarMarkdown,
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
		const lessonSectionId = readText(formData, 'lessonSectionId');
		const wordId = readText(formData, 'wordId');
		const itemOrder = readInteger(formData, 'itemOrder');
		const sentenceKalenjin = readText(formData, 'sentenceKalenjin');
		const sentenceEnglish = readText(formData, 'sentenceEnglish');
		const sentenceSource = readOptionalText(formData, 'sentenceSource');
		const sentenceTranslation = readOptionalText(formData, 'sentenceTranslation');
		const wordForWordTranslation = readOptionalText(formData, 'wordForWordTranslation');
		const notesMarkdown = readOptionalText(formData, 'notesMarkdown');
		const cefrTargetIds = readStringList(formData, 'cefrTargetIds');

		if (!lessonSectionId || !wordId || itemOrder === null || !sentenceKalenjin || !sentenceEnglish) {
			return fail(400, {
				error:
					'Lesson section, word, item order, sentence text, and sentence translation are required.'
			});
		}

		try {
			const lessonWord = await prisma.$transaction(async (tx) => {
				const sentence = await tx.exampleSentence.create({
					data: {
						kalenjin: sentenceKalenjin,
						english: sentenceEnglish,
						source: sentenceSource
					}
				});

				const createdLessonWord = await tx.lessonWord.create({
					data: {
						lessonSectionId,
						wordId,
						itemOrder,
						sentenceId: sentence.id,
						sentenceTranslation,
						wordForWordTranslation,
						notesMarkdown
					}
				});

				return { sentenceId: sentence.id, lessonWordId: createdLessonWord.id };
			});

			await ensureWordSentenceLink(wordId, lessonWord.sentenceId);
			await ensureCefrCoverage(lessonWord.lessonWordId, cefrTargetIds);
		} catch (createError) {
			return fail(400, {
				error:
					createError instanceof Error ? createError.message : 'Could not create lesson word.'
			});
		}

		return { createWordSuccess: true };
	},
	updateWord: async ({ request }) => {
		const formData = await request.formData();
		const id = readText(formData, 'id');
		const wordId = readText(formData, 'wordId');
		const itemOrder = readInteger(formData, 'itemOrder');
		const sentenceKalenjin = readText(formData, 'sentenceKalenjin');
		const sentenceEnglish = readText(formData, 'sentenceEnglish');
		const sentenceSource = readOptionalText(formData, 'sentenceSource');
		const sentenceTranslation = readOptionalText(formData, 'sentenceTranslation');
		const wordForWordTranslation = readOptionalText(formData, 'wordForWordTranslation');
		const notesMarkdown = readOptionalText(formData, 'notesMarkdown');

		if (!id || !wordId || itemOrder === null || !sentenceKalenjin || !sentenceEnglish) {
			return fail(400, {
				error: 'Lesson word id, word, item order, and sentence fields are required.'
			});
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
				await tx.exampleSentence.update({
					where: { id: existingLessonWord.sentenceId },
					data: {
						kalenjin: sentenceKalenjin,
						english: sentenceEnglish,
						source: sentenceSource
					}
				});

				await tx.lessonWord.update({
					where: { id },
					data: {
						wordId,
						itemOrder,
						sentenceTranslation,
						wordForWordTranslation,
						notesMarkdown
					}
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
	updateWordCefrTargets: async ({ request }) => {
		const formData = await request.formData();
		const id = readText(formData, 'id');
		const cefrTargetIds = readStringList(formData, 'cefrTargetIds');

		if (!id) {
			return fail(400, { error: 'Lesson word id is required.' });
		}

		try {
			await ensureCefrCoverage(id, cefrTargetIds);
		} catch (updateError) {
			return fail(400, {
				error:
					updateError instanceof Error
						? updateError.message
						: 'Could not update CEFR coverage.'
			});
		}

		return { updateWordCefrTargetsSuccess: true };
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
	}
};
