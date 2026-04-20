import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { searchWordsByKalenjin } from '$lib/server/kalenjin-word-search';
import type { RequestHandler } from './$types';

const MAX_RESULTS = 7;

type SearchResult = {
	id: string;
	kalenjin: string;
	translations: string;
	partOfSpeech: string | null;
};

function toResult(word: {
	id: string;
	kalenjin: string;
	translations: string;
	partOfSpeech: string | null;
}): SearchResult {
	return {
		id: word.id,
		kalenjin: word.kalenjin,
		translations: word.translations,
		partOfSpeech: word.partOfSpeech
	};
}

export const GET: RequestHandler = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();

	if (!query) {
		return json({ results: [] satisfies SearchResult[] });
	}

	const [kalenjinMatches, translationMatches] = await Promise.all([
		searchWordsByKalenjin(prisma, query, MAX_RESULTS),
		prisma.word.findMany({
			where: { translations: { contains: query, mode: 'insensitive' } },
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: MAX_RESULTS,
			select: { id: true, kalenjin: true, translations: true, partOfSpeech: true }
		})
	]);

	const merged = new Map<string, SearchResult>();
	for (const word of kalenjinMatches) {
		merged.set(word.id, toResult(word));
	}
	for (const word of translationMatches) {
		if (!merged.has(word.id)) {
			merged.set(word.id, toResult(word));
		}
	}

	return json({ results: [...merged.values()].slice(0, MAX_RESULTS) });
};
