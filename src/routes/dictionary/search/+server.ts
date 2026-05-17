import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import {
	scoreKalenjinWordMatch,
	searchWordsByKalenjin
} from '$lib/server/kalenjin-word-search';
import {
	isNumericTranslationSearchQuery,
	sortTranslationSearchResults
} from '$lib/translations';
import { splitPluralFormVariants } from '$lib/plural-form-variants';
import type { RequestHandler } from './$types';

const MAX_RESULTS = 7;
const TRANSLATION_CANDIDATE_LIMIT = MAX_RESULTS * 10;
// Score 8+ corresponds to "contains" matches (mid-word substring); below that
// is exact or prefix. Duplicate detection only wants the latter.
const PREFIX_OR_EXACT_SCORE_LIMIT = 8;

type SearchResult = {
	id: string;
	kalenjin: string;
	pluralForm: string | null;
	translations: string;
	partOfSpeech: string | null;
};

function toResult(word: {
	id: string;
	kalenjin: string;
	pluralForm: string | null;
	translations: string;
	partOfSpeech: string | null;
}): SearchResult {
	return {
		id: word.id,
		kalenjin: word.kalenjin,
		pluralForm: splitPluralFormVariants(word.pluralForm).pluralForm || null,
		translations: word.translations,
		partOfSpeech: word.partOfSpeech
	};
}

export const GET: RequestHandler = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	const kalenjinOnly = url.searchParams.get('lang') === 'kalenjin';

	if (!query) {
		return json({ results: [] satisfies SearchResult[] });
	}

	if (kalenjinOnly) {
		const kalenjinMatches = await searchWordsByKalenjin(prisma, query, MAX_RESULTS);
		const prefixOrExact = kalenjinMatches.filter(
			(word) => scoreKalenjinWordMatch(word, query) < PREFIX_OR_EXACT_SCORE_LIMIT
		);
		return json({ results: prefixOrExact.map(toResult) });
	}

	const prioritizeTranslations = isNumericTranslationSearchQuery(query);
	const [kalenjinMatches, translationMatches] = await Promise.all([
		searchWordsByKalenjin(prisma, query, MAX_RESULTS),
		prisma.word.findMany({
			where: { translations: { contains: query, mode: 'insensitive' } },
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: TRANSLATION_CANDIDATE_LIMIT,
			select: {
				id: true,
				kalenjin: true,
				pluralForm: true,
				translations: true,
				partOfSpeech: true
			}
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
