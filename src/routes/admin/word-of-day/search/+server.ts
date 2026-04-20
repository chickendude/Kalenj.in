import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import { getLastUsedMap } from '$lib/server/word-of-the-day';
import type { RequestHandler } from './$types';

export type WordSearchHit = {
	id: string;
	kalenjin: string;
	translations: string;
	partOfSpeech: string | null;
	lastUsedOn: string | null;
	lastUsedIsFuture: boolean;
};

export const GET: RequestHandler = async ({ url, locals }) => {
	requireEditor(locals);

	const query = (url.searchParams.get('q') ?? '').trim();
	if (query.length === 0) {
		return json({ results: [] satisfies WordSearchHit[], query });
	}

	const words = await prisma.word.findMany({
		where: {
			OR: [
				{ kalenjin: { contains: query, mode: 'insensitive' } },
				{ translations: { contains: query, mode: 'insensitive' } }
			]
		},
		orderBy: { kalenjin: 'asc' },
		take: 12,
		select: {
			id: true,
			kalenjin: true,
			translations: true,
			partOfSpeech: true
		}
	});

	const lastUsed = await getLastUsedMap(words.map((w) => w.id));

	const results: WordSearchHit[] = words.map((w) => {
		const hit = lastUsed.get(w.id);
		return {
			id: w.id,
			kalenjin: w.kalenjin,
			translations: w.translations,
			partOfSpeech: w.partOfSpeech,
			lastUsedOn: hit ? hit.date.toISOString().slice(0, 10) : null,
			lastUsedIsFuture: hit?.isFuture ?? false
		};
	});

	return json({ results, query });
};
