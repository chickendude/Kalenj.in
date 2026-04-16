import { fail, redirect } from '@sveltejs/kit';
import {
	CEFR_LEVELS,
	LESSON_TYPES,
	VOCABULARY_LESSON_TYPES,
	getInsertedLessonOrder,
	getNextLessonOrder
} from '$lib/course';
import {
	parseCefrLevelValue,
	parseLessonTypeValue,
	parseVocabularyLessonTypeValue,
	readOptionalText,
	readText
} from '$lib/server/course-form';
import { prisma } from '$lib/server/prisma';
import { validateStoryImportText } from '$lib/story-import';
import { syncStorySentences } from '$lib/server/story-sync';
import type { Prisma } from '@prisma/client';
import type { Actions, PageServerLoad } from './$types';

async function shiftLessonsForInsert(
	tx: Prisma.TransactionClient,
	level: (typeof CEFR_LEVELS)[number],
	lessonOrder: number
): Promise<void> {
	const lessonsToShift = await tx.lesson.findMany({
		where: {
			level,
			lessonOrder: {
				gte: lessonOrder
			}
		},
		orderBy: {
			lessonOrder: 'desc'
		},
		select: {
			id: true,
			lessonOrder: true
		}
	});

	for (const lesson of lessonsToShift) {
		await tx.lesson.update({
			where: { id: lesson.id },
			data: { lessonOrder: lesson.lessonOrder + 1 }
		});
	}
}

async function createLessonRecord(
	tx: Prisma.TransactionClient,
	{
		title,
		level,
		lessonOrder,
		type,
		vocabularyType,
		grammarMarkdown,
		storyImportText
	}: {
		title: string;
		level: (typeof CEFR_LEVELS)[number];
		lessonOrder: number;
		type: NonNullable<ReturnType<typeof parseLessonTypeValue>>;
		vocabularyType: ReturnType<typeof parseVocabularyLessonTypeValue>;
		grammarMarkdown: string | null;
		storyImportText: string | null;
	}
) {
	const story =
		type === 'STORY'
			? await tx.story.create({
					data: {
						title
					}
				})
			: null;

	if (story && storyImportText) {
		await syncStorySentences(tx, story.id, storyImportText);
	}

	return tx.lesson.create({
		data: {
			title,
			level,
			lessonOrder,
			type,
			vocabularyType: type === 'VOCABULARY' ? vocabularyType : null,
			grammarMarkdown: type === 'VOCABULARY' ? grammarMarkdown : null,
			storyId: story?.id ?? null
		}
	});
}

export const load: PageServerLoad = async ({ url }) => {
	const selectedLevel =
		parseCefrLevelValue(url.searchParams.get('level') ?? '') ?? CEFR_LEVELS[0];

	const lessons = await prisma.lesson.findMany({
		include: {
			story: true,
			_count: {
				select: {
					sections: true
				}
			}
		},
		orderBy: [{ level: 'asc' }, { lessonOrder: 'asc' }]
	});

	return {
		levels: CEFR_LEVELS,
		selectedLevel,
		levelSummaries: CEFR_LEVELS.map((level) => ({
			level,
			lessonCount: lessons.filter((lesson) => lesson.level === level).length
		})),
		lessonTypes: LESSON_TYPES,
		vocabularyTypes: VOCABULARY_LESSON_TYPES,
		lessons,
		selectedLevelLessons: lessons.filter((lesson) => lesson.level === selectedLevel),
		nextLessonOrder: getNextLessonOrder(
			lessons
				.filter((lesson) => lesson.level === selectedLevel)
				.map((lesson) => lesson.lessonOrder)
		)
	};
};

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		const title = readText(formData, 'title');
		const level = parseCefrLevelValue(readText(formData, 'level'));
		const type = parseLessonTypeValue(readText(formData, 'type'));
		const vocabularyType = parseVocabularyLessonTypeValue(readText(formData, 'vocabularyType'));
		const grammarMarkdown = readOptionalText(formData, 'grammarMarkdown');
		const storyImportText = readOptionalText(formData, 'storyImportText');

		if (!title || !level || !type) {
			return fail(400, {
				error: 'Level, title, and type are required.',
				values: {
					title,
					level: readText(formData, 'level'),
					type: readText(formData, 'type'),
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? ''
				}
			});
		}

		if (type === 'VOCABULARY' && !vocabularyType) {
			return fail(400, {
				error: 'Vocabulary lessons must have a vocabulary type.',
				values: {
					title,
					level,
					type,
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? ''
				}
			});
		}

		if (type === 'STORY' && storyImportText) {
			const importError = validateStoryImportText(storyImportText);

			if (importError) {
				return fail(400, {
					error: importError,
					values: {
						title,
						level,
						type,
						vocabularyType: readText(formData, 'vocabularyType'),
						grammarMarkdown: grammarMarkdown ?? ''
					}
				});
			}
		}

		const nextLessonOrder = getNextLessonOrder(
			(
				await prisma.lesson.findMany({
					where: { level },
					select: { lessonOrder: true }
				})
			).map((lesson) => lesson.lessonOrder)
		);

		let lessonId: string;

		try {
			const lesson = await prisma.$transaction(async (tx) => {
				return createLessonRecord(tx, {
					title,
					level,
					lessonOrder: nextLessonOrder,
					type,
					vocabularyType,
					grammarMarkdown,
					storyImportText
				});
			});

			lessonId = lesson.id;
		} catch (error) {
			return fail(400, {
				error: 'Could not create lesson. Check for duplicate lesson order or story assignment.',
				values: {
					title,
					level,
					type,
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? ''
				}
			});
		}

		redirect(303, `/lessons/${lessonId}`);
	},
	createAdjacent: async ({ request }) => {
		const formData = await request.formData();
		const title = readText(formData, 'title');
		const anchorLessonId = readText(formData, 'anchorLessonId');
		const positionValue = readText(formData, 'position');
		const type = parseLessonTypeValue(readText(formData, 'type'));
		const vocabularyType = parseVocabularyLessonTypeValue(readText(formData, 'vocabularyType'));
		const grammarMarkdown = readOptionalText(formData, 'grammarMarkdown');
		const storyImportText = readOptionalText(formData, 'storyImportText');

		if (
			!title ||
			!anchorLessonId ||
			(positionValue !== 'before' && positionValue !== 'after') ||
			!type
		) {
			return fail(400, {
				error: 'Lesson title, type, and placement are required.',
				values: {
					title,
					anchorLessonId,
					position: positionValue,
					type: readText(formData, 'type'),
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? ''
				}
			});
		}

		if (type === 'VOCABULARY' && !vocabularyType) {
			return fail(400, {
				error: 'Vocabulary lessons must have a vocabulary type.',
				values: {
					title,
					anchorLessonId,
					position: positionValue,
					type,
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? ''
				}
			});
		}

		if (type === 'STORY' && storyImportText) {
			const importError = validateStoryImportText(storyImportText);

			if (importError) {
				return fail(400, {
					error: importError,
					values: {
						title,
						anchorLessonId,
						position: positionValue,
						type,
						vocabularyType: readText(formData, 'vocabularyType'),
						grammarMarkdown: grammarMarkdown ?? ''
					}
				});
			}
		}

		let lessonId: string;

		try {
			const lesson = await prisma.$transaction(async (tx) => {
				const anchorLesson = await tx.lesson.findUnique({
					where: { id: anchorLessonId },
					select: { id: true, level: true, lessonOrder: true }
				});

				if (!anchorLesson) {
					throw new Error('Lesson not found.');
				}

				const lessonOrder = getInsertedLessonOrder(anchorLesson.lessonOrder, positionValue);

				await shiftLessonsForInsert(tx, anchorLesson.level, lessonOrder);

				return createLessonRecord(tx, {
					title,
					level: anchorLesson.level,
					lessonOrder,
					type,
					vocabularyType,
					grammarMarkdown,
					storyImportText
				});
			});

			lessonId = lesson.id;
		} catch (error) {
			return fail(400, {
				error:
					error instanceof Error
						? error.message
						: 'Could not create lesson at that position.',
				values: {
					title,
					anchorLessonId,
					position: positionValue,
					type: readText(formData, 'type'),
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? ''
				}
			});
		}

		redirect(303, `/lessons/${lessonId}`);
	}
};
