import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { normalizeKalenjinSearchQuery, searchWordsByKalenjin } from '$lib/server/kalenjin-word-search';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';

export const GET: RequestHandler = async ({ url, params, locals }) => {
	requireEditor(locals);
	const query = normalizeKalenjinSearchQuery(url.searchParams.get('q') ?? '');
	const words = await searchWordsByKalenjin(prisma, query, query ? 12 : 8);

	const wordIds = words.map((word) => word.id);
	const otherLessonsByWordId = new Map<string, { id: string; title: string }[]>();

	if (wordIds.length > 0) {
		const lessonWordUsages = await prisma.lessonWord.findMany({
			where: {
				wordId: { in: wordIds },
				lessonSection: {
					lessonId: { not: params.id }
				}
			},
			select: {
				wordId: true,
				lessonSection: {
					select: {
						lesson: {
							select: { id: true, title: true }
						}
					}
				}
			}
		});

		for (const usage of lessonWordUsages) {
			if (!usage.wordId) continue;
			const lesson = usage.lessonSection.lesson;
			const existing = otherLessonsByWordId.get(usage.wordId) ?? [];
			if (existing.some((entry) => entry.id === lesson.id)) continue;
			existing.push({ id: lesson.id, title: lesson.title });
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
