import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { searchWordsByKalenjin } from '$lib/server/kalenjin-word-search';
import {
	isNumericTranslationSearchQuery,
	sortTranslationSearchResults
} from '$lib/translations';
import type { RequestHandler } from './$types';

const MAX_RESULTS = 7;
const TRANSLATION_CANDIDATE_LIMIT = MAX_RESULTS * 10;

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

	const prioritizeTranslations = isNumericTranslationSearchQuery(query);
	const [kalenjinMatches, translationMatches] = await Promise.all([
		searchWordsByKalenjin(prisma, query, MAX_RESULTS),
		prisma.word.findMany({
			where: { translations: { contains: query, mode: 'insensitive' } },
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: TRANSLATION_CANDIDATE_LIMIT,
			select: { id: true, kalenjin: true, translations: true, partOfSpeech: true }
		})
	]);

	const rankedTranslationMatches = prioritizeTranslations
		? sortTranslationSearchResults(translationMatches, query)
		: translationMatches;
	const merged = new Map<string, SearchResult>();
	for (const word of prioritizeTranslations ? rankedTranslationMatches : kalenjinMatches) {
		merged.set(word.id, toResult(word));
	}
	for (const word of prioritizeTranslations ? kalenjinMatches : rankedTranslationMatches) {
		if (!merged.has(word.id)) {
			merged.set(word.id, toResult(word));
		}
	}

	return json({ results: [...merged.values()].slice(0, MAX_RESULTS) });
};
