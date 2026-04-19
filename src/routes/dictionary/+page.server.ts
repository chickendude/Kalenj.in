import type { PartOfSpeech } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { prisma } from '$lib/server/prisma';
import { searchWordsByKalenjin } from '$lib/server/kalenjin-word-search';
import type { PageServerLoad } from './$types';

type SearchLanguage = 'both' | 'translations' | 'kalenjin';

function parseLanguage(value: string | null): SearchLanguage {
	if (value === 'both' || value === 'translations' || value === 'kalenjin') {
		return value;
	}

	return 'kalenjin';
}

function filterByPartOfSpeech<T extends { partOfSpeech: PartOfSpeech | null }>(
	words: T[],
	partOfSpeech: PartOfSpeech | null
): T[] {
	if (!partOfSpeech) {
		return words;
	}

	return words.filter((word) => word.partOfSpeech === partOfSpeech);
}

export const load: PageServerLoad = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	const language = parseLanguage(url.searchParams.get('lang'));
	const posParam = url.searchParams.get('pos') ?? '';
	const pos = isPartOfSpeech(posParam) ? posParam : null;
	const limit = 200;

	let words;
	if (!query) {
		words = await prisma.word.findMany({
			where: pos ? { partOfSpeech: pos } : undefined,
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: limit
		});
	} else if (language === 'translations') {
		words = await prisma.word.findMany({
			where: {
				...(pos ? { partOfSpeech: pos } : {}),
				translations: { contains: query, mode: 'insensitive' }
			},
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: limit
		});
	} else if (language === 'kalenjin') {
		words = filterByPartOfSpeech(await searchWordsByKalenjin(prisma, query, limit), pos);
	} else {
		const [kalenjinWords, translationWords] = await Promise.all([
			searchWordsByKalenjin(prisma, query, limit),
			prisma.word.findMany({
				where: {
					...(pos ? { partOfSpeech: pos } : {}),
					translations: { contains: query, mode: 'insensitive' }
				},
				orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
				take: limit
			})
		]);

		const mergedWords = new Map<string, (typeof translationWords)[number]>();
		for (const word of filterByPartOfSpeech(kalenjinWords, pos)) {
			mergedWords.set(word.id, word);
		}
		for (const word of translationWords) {
			if (!mergedWords.has(word.id)) {
				mergedWords.set(word.id, word);
			}
		}

		words = [...mergedWords.values()].slice(0, limit);
	}

	const totalCount = await prisma.word.count();

	return { query, language, pos: posParam, words, totalCount };
};
