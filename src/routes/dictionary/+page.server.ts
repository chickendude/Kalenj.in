import { prisma } from '$lib/server/prisma';
import { searchWordsByKalenjin } from '$lib/server/kalenjin-word-search';
import type { PageServerLoad } from './$types';

type SearchLanguage = 'both' | 'translations' | 'kalenjin';

function parseLanguage(value: string | null): SearchLanguage {
	if (value === 'translations' || value === 'kalenjin') {
		return value;
	}

	return 'kalenjin';
}

export const load: PageServerLoad = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	const language = parseLanguage(url.searchParams.get('lang'));
	const limit = 200;

	let words;
	if (!query) {
		words = await prisma.word.findMany({
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: limit
		});
	} else if (language === 'translations') {
		words = await prisma.word.findMany({
			where: {
				translations: { contains: query, mode: 'insensitive' }
			},
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: limit
		});
	} else if (language === 'kalenjin') {
		words = await searchWordsByKalenjin(prisma, query, limit);
	} else {
		const [kalenjinWords, translationWords] = await Promise.all([
			searchWordsByKalenjin(prisma, query, limit),
			prisma.word.findMany({
				where: {
					translations: { contains: query, mode: 'insensitive' }
				},
				orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
				take: limit
			})
		]);

		const mergedWords = new Map<string, (typeof translationWords)[number]>();
		for (const word of kalenjinWords) {
			mergedWords.set(word.id, word);
		}
		for (const word of translationWords) {
			if (!mergedWords.has(word.id)) {
				mergedWords.set(word.id, word);
			}
		}

		words = [...mergedWords.values()].slice(0, limit);
	}

	return {
		query,
		language,
		words
	};
};
