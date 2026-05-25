import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { normalizeKalenjinSearchQuery, searchWordsByKalenjin } from '$lib/server/kalenjin-word-search';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';

export const GET: RequestHandler = async ({ url, params, locals }) => {
	requireEditor(locals);
	const query = normalizeKalenjinSearchQuery(url.searchParams.get('q') ?? '');
	const words = await searchWordsByKalenjin(prisma, query, query ? 12 : 8);
	const currentLesson = await prisma.lesson.findUnique({
		where: { id: params.id },
		select: { level: true, lessonOrder: true }
	});

	const wordIds = words.map((word) => word.id);
	const otherLessonsByWordId = new Map<
		string,
		{ id: string; title: string; level: string; lessonOrder: number; timing: 'earlier' | 'later' | 'other' }[]
	>();

	if (currentLesson && wordIds.length > 0) {
		const lessonWordUsages = await prisma.lessonWord.findMany({
			where: {
				wordId: { in: wordIds },
				lessonSection: {
					lessonId: { not: params.id },
					lesson: {
						level: currentLesson.level,
						type: 'VOCABULARY',
						lessonOrder: { lte: currentLesson.lessonOrder }
					}
				}
			},
			select: {
				wordId: true,
				lessonSection: {
					select: {
						lesson: {
							select: { id: true, title: true, level: true, lessonOrder: true }
						}
					}
				}
			}
		});

		for (const usage of lessonWordUsages) {
			if (!usage.wordId) continue;
			const lesson = usage.lessonSection.lesson;
			if (lesson.level !== currentLesson.level || lesson.lessonOrder > currentLesson.lessonOrder) continue;
			const existing = otherLessonsByWordId.get(usage.wordId) ?? [];
			if (existing.some((entry) => entry.id === lesson.id)) continue;
			existing.push({
				id: lesson.id,
				title: lesson.title,
				level: lesson.level,
				lessonOrder: lesson.lessonOrder,
				timing: 'earlier'
			});
			existing.sort((a, b) => a.lessonOrder - b.lessonOrder || a.title.localeCompare(b.title));
			otherLessonsByWordId.set(usage.wordId, existing);
		}
	}

	return json({
		results: words.map((word) => ({
			id: word.id,
			kalenjin: word.kalenjin,
			translations: word.translations,
			notes: word.notes ?? null,
			otherLessons: otherLessonsByWordId.get(word.id) ?? []
		}))
	});
};
