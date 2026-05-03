import type { PartOfSpeech, Prisma } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import { searchWordsByKalenjin } from '$lib/server/kalenjin-word-search';
import { filterByPartOfSpeech } from '$lib/server/word-filters';
import type { PageServerLoad } from './$types';

const FETCH_LIMIT = 50;
const SEARCH_LIMIT = 200;

type WordRow = {
	id: string;
	kalenjin: string;
	translations: string;
	partOfSpeech: PartOfSpeech | null;
};

function shapeWord(word: {
	id: string;
	kalenjin: string;
	translations: string;
	partOfSpeech: PartOfSpeech | null;
}): WordRow {
	return {
		id: word.id,
		kalenjin: word.kalenjin,
		translations: word.translations,
		partOfSpeech: word.partOfSpeech
	};
}

export const load: PageServerLoad = async ({ locals, url }) => {
	requireEditor(locals);

	const posParam = url.searchParams.get('pos') ?? '';
	const pos: PartOfSpeech | null = isPartOfSpeech(posParam) ? posParam : null;
	const query = (url.searchParams.get('q') ?? '').trim();

	const posWhere: Prisma.WordWhereInput | null = pos ? { partOfSpeech: pos } : null;
	const filterAndClauses: Prisma.WordWhereInput[] = [{ audioUrl: null }];
	if (posWhere) filterAndClauses.push(posWhere);
	const filterWhere: Prisma.WordWhereInput = { AND: filterAndClauses };

	let words: WordRow[];
	let total: number;

	if (query) {
		const searched = await searchWordsByKalenjin(prisma, query, SEARCH_LIMIT);
		const scoped = searched.filter((w) => !w.audioUrl);
		const posFiltered = filterByPartOfSpeech(scoped, pos);
		words = posFiltered.map(shapeWord);
		total = words.length;
	} else {
		const [count, rows] = await Promise.all([
			prisma.word.count({ where: filterWhere }),
			prisma.word.findMany({
				where: filterWhere,
				orderBy: [{ kalenjin: 'asc' }],
				take: FETCH_LIMIT,
				select: {
					id: true,
					kalenjin: true,
					translations: true,
					partOfSpeech: true
				}
			})
		]);
		total = count;
		words = rows.map(shapeWord);
	}

	return {
		words,
		total,
		fetchLimit: FETCH_LIMIT,
		pos: posParam,
		q: query
	};
};
