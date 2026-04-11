import { fail, redirect } from '@sveltejs/kit';
import { CEFR_LEVELS, LESSON_TYPES, PUBLISH_STATUSES, VOCABULARY_LESSON_TYPES } from '$lib/course';
import {
	parseCefrLevelValue,
	parseLessonTypeValue,
	parsePublishStatusValue,
	parseVocabularyLessonTypeValue,
	readInteger,
	readOptionalText,
	readText
} from '$lib/server/course-form';
import { prisma } from '$lib/server/prisma';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [lessons, stories] = await Promise.all([
		prisma.lesson.findMany({
			include: {
				story: true,
				_count: {
					select: {
						sections: true
					}
				}
			},
			orderBy: [{ level: 'asc' }, { lessonOrder: 'asc' }]
		}),
		prisma.story.findMany({
			orderBy: { title: 'asc' }
		})
	]);

	return {
		levels: CEFR_LEVELS,
		lessonTypes: LESSON_TYPES,
		vocabularyTypes: VOCABULARY_LESSON_TYPES,
		publishStatuses: PUBLISH_STATUSES,
		lessons,
		stories
	};
};

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		const title = readText(formData, 'title');
		const level = parseCefrLevelValue(readText(formData, 'level'));
		const lessonOrder = readInteger(formData, 'lessonOrder');
		const type = parseLessonTypeValue(readText(formData, 'type'));
		const vocabularyType = parseVocabularyLessonTypeValue(readText(formData, 'vocabularyType'));
		const grammarMarkdown = readOptionalText(formData, 'grammarMarkdown');
		const notes = readOptionalText(formData, 'notes');
		const status = parsePublishStatusValue(readText(formData, 'status'));
		const storyId = readOptionalText(formData, 'storyId');

		if (!title || !level || lessonOrder === null || !type || !status) {
			return fail(400, {
				error: 'Level, title, lesson order, type, and status are required.',
				values: {
					title,
					level: readText(formData, 'level'),
					lessonOrder: readText(formData, 'lessonOrder'),
					type: readText(formData, 'type'),
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? '',
					notes: notes ?? '',
					status: readText(formData, 'status'),
					storyId: storyId ?? ''
				}
			});
		}

		if (type === 'STORY' && !storyId) {
			return fail(400, {
				error: 'Story lessons must be linked to a story.',
				values: {
					title,
					level,
					lessonOrder: String(lessonOrder),
					type,
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? '',
					notes: notes ?? '',
					status,
					storyId: storyId ?? ''
				}
			});
		}

		if (type === 'VOCABULARY' && !vocabularyType) {
			return fail(400, {
				error: 'Vocabulary lessons must have a vocabulary type.',
				values: {
					title,
					level,
					lessonOrder: String(lessonOrder),
					type,
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? '',
					notes: notes ?? '',
					status,
					storyId: storyId ?? ''
				}
			});
		}

		try {
			const lesson = await prisma.lesson.create({
				data: {
					title,
					level,
					lessonOrder,
					type,
					vocabularyType: type === 'VOCABULARY' ? vocabularyType : null,
					grammarMarkdown,
					notes,
					status,
					storyId: type === 'STORY' ? storyId : null
				}
			});

			redirect(303, `/lessons/${lesson.id}`);
		} catch (error) {
			return fail(400, {
				error: 'Could not create lesson. Check for duplicate lesson order or story assignment.',
				values: {
					title,
					level,
					lessonOrder: String(lessonOrder),
					type,
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? '',
					notes: notes ?? '',
					status,
					storyId: storyId ?? ''
				}
			});
		}
	}
};
