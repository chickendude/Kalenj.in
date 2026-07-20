import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { requireAdmin } from '$lib/server/guards';
import { attachDictionaryHrefs } from '$lib/server/dictionary-hrefs';
import { rangeBounds } from '$lib/server/stats';
import { parseStatsRange } from '$lib/stats-preferences';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

type ActivityEntryType = 'words' | 'sentences';

type ActivityEntry = {
	id: string;
	href: string;
	kalenjin: string;
	english: string;
	createdAt: Date;
};

function parsePage(raw: string | null): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1) return 1;
	return Math.floor(n);
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	requireAdmin(locals);

	const type: ActivityEntryType =
		url.searchParams.get('type') === 'sentences' ? 'sentences' : 'words';
	const range = parseStatsRange(url.searchParams.get('range'));
	const page = parsePage(url.searchParams.get('page'));

	const targetUser = await prisma.user.findUnique({
		where: { id: params.userId },
		select: { id: true, username: true, displayName: true, role: true }
	});
	if (!targetUser) error(404, 'User not found.');

	const { from, to } = await rangeBounds(range);
	const where = {
		createdById: targetUser.id,
		...(range === 'allTime' ? {} : { createdAt: { gte: from, lt: to } })
	};

	let totalCount: number;
	let entries: ActivityEntry[];

	if (type === 'words') {
		const [count, words] = await Promise.all([
			prisma.word.count({ where }),
			prisma.word.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip: (page - 1) * PAGE_SIZE,
				take: PAGE_SIZE,
				select: { id: true, kalenjin: true, slug: true, translations: true, createdAt: true }
			})
		]);
		totalCount = count;
		entries = (await attachDictionaryHrefs(prisma, words)).map((word) => ({
			id: word.id,
			href: word.href,
			kalenjin: word.kalenjin,
			english: word.translations,
			createdAt: word.createdAt
		}));
	} else {
		const [count, sentences] = await Promise.all([
			prisma.exampleSentence.count({ where }),
			prisma.exampleSentence.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip: (page - 1) * PAGE_SIZE,
				take: PAGE_SIZE,
				select: { id: true, kalenjin: true, english: true, createdAt: true }
			})
		]);
		totalCount = count;
		entries = sentences.map((sentence) => ({
			id: sentence.id,
			href: `/corpus/${sentence.id}`,
			kalenjin: sentence.kalenjin,
			english: sentence.english,
			createdAt: sentence.createdAt
		}));
	}

	return {
		targetUser,
		type,
		range,
		page,
		pageSize: PAGE_SIZE,
		totalCount,
		entries
	};
};
