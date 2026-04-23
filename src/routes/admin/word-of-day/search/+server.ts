import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import { searchWordsByKalenjin } from '$lib/server/kalenjin-word-search';
import {
	isNumericTranslationSearchQuery,
	sortTranslationSearchResults
} from '$lib/translations';
import { getLastUsedMap } from '$lib/server/word-of-the-day';
import type { RequestHandler } from './$types';

export type WordSearchHit = {
	id: string;
	kalenjin: string;
	translations: string;
	partOfSpeech: string | null;
	lastUsedOn: string | null;
	lastUsedIsFuture: boolean;
	lastShownOn: string | null;
};

export const GET: RequestHandler = async ({ url, locals }) => {
	requireEditor(locals);

	const query = (url.searchParams.get('q') ?? '').trim();
	if (query.length === 0) {
		return json({ results: [] satisfies WordSearchHit[], query });
	}

	const [kalenjinWords, translationWords] = await Promise.all([
		searchWordsByKalenjin(prisma, query, 12),
		prisma.word.findMany({
			where: {
				translations: { contains: query, mode: 'insensitive' }
			},
			orderBy: { kalenjin: 'asc' },
			select: {
				id: true,
				kalenjin: true,
				translations: true,
				partOfSpeech: true
			}
		})
	]);

	const rankedTranslationWords = sortTranslationSearchResults(translationWords, query);
	const prioritizeTranslations = isNumericTranslationSearchQuery(query);
	const merged = new Map<string, (typeof translationWords)[number]>();
	for (const word of prioritizeTranslations ? rankedTranslationWords : kalenjinWords) {
		merged.set(word.id, word);
	}
	for (const word of prioritizeTranslations ? kalenjinWords : rankedTranslationWords) {
		if (!merged.has(word.id)) {
			merged.set(word.id, word);
		}
	}

	const words = [...merged.values()].slice(0, 12);

	const lastUsed = await getLastUsedMap(words.map((w) => w.id));

	const results: WordSearchHit[] = words.map((w) => {
		const hit = lastUsed.get(w.id);
		return {
			id: w.id,
			kalenjin: w.kalenjin,
			translations: w.translations,
			partOfSpeech: w.partOfSpeech,
			lastUsedOn: hit ? hit.date.toISOString().slice(0, 10) : null,
			lastUsedIsFuture: hit?.isFuture ?? false,
			lastShownOn: hit?.lastShownDate ? hit.lastShownDate.toISOString().slice(0, 10) : null
		};
	});

	return json({ results, query });
};
