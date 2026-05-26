import type { Prisma, PrismaClient } from '@prisma/client';
import { dictionaryEntryHref } from '$lib/word-url';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type DictionaryHrefWord = {
	id: string;
	kalenjin: string;
	slug?: string;
};

export async function dictionaryHrefMap(
	client: PrismaLike,
	words: DictionaryHrefWord[]
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	const missingSlugIds = words.filter((word) => !word.slug).map((word) => word.id);
	const storedSlugs = missingSlugIds.length
		? await client.word.findMany({
				where: { id: { in: missingSlugIds } },
				select: { id: true, slug: true }
			})
		: [];
	const slugById = new Map(storedSlugs.map((word) => [word.id, word.slug]));

	for (const word of words) {
		map.set(word.id, dictionaryEntryHref({ ...word, slug: word.slug ?? slugById.get(word.id) }));
	}

	return map;
}

export async function canonicalDictionaryHref(
	client: PrismaLike,
	word: DictionaryHrefWord
): Promise<string> {
	const hrefs = await dictionaryHrefMap(client, [word]);
	return hrefs.get(word.id) ?? dictionaryEntryHref(word);
}

export async function attachDictionaryHrefs<T extends DictionaryHrefWord>(
	client: PrismaLike,
	words: T[]
): Promise<Array<T & { href: string }>> {
	if (words.length === 0) return [];
	const hrefs = await dictionaryHrefMap(client, words);
	return words.map((word) => ({
		...word,
		href: hrefs.get(word.id) ?? dictionaryEntryHref(word)
	}));
}
