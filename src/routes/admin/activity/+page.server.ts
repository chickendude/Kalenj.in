import { redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import { rangeBounds } from '$lib/server/stats';
import { parseStatsRange } from '$lib/stats-preferences';
import { buildStaffActivity, type ActivityCount } from '$lib/staff-activity';
import type { PageServerLoad } from './$types';

type GroupByRow = { createdById: string | null; _count: { _all: number } };

function toActivityCounts(rows: GroupByRow[]): ActivityCount[] {
	return rows.map((row) => ({ createdById: row.createdById, count: row._count._all }));
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const viewer = requireEditor(locals);
	// Managers see only their own activity, so send them straight to their page.
	if (viewer.role !== 'ADMIN') redirect(302, `/admin/activity/${viewer.id}${url.search}`);

	const range = parseStatsRange(url.searchParams.get('range'));
	const { from, to } = await rangeBounds(range);
	const inRange = range === 'allTime' ? {} : { createdAt: { gte: from, lt: to } };

	const [users, words, wordsInRange, sentences, sentencesInRange] = await Promise.all([
		prisma.user.findMany({
			select: { id: true, username: true, displayName: true, role: true }
		}),
		prisma.word.groupBy({ by: ['createdById'], _count: { _all: true } }),
		prisma.word.groupBy({ by: ['createdById'], where: inRange, _count: { _all: true } }),
		prisma.exampleSentence.groupBy({ by: ['createdById'], _count: { _all: true } }),
		prisma.exampleSentence.groupBy({ by: ['createdById'], where: inRange, _count: { _all: true } })
	]);

	return {
		activity: buildStaffActivity(users, {
			words: toActivityCounts(words),
			wordsInRange: toActivityCounts(wordsInRange),
			sentences: toActivityCounts(sentences),
			sentencesInRange: toActivityCounts(sentencesInRange)
		}),
		range
	};
};
