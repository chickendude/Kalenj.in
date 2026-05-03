import type { PartOfSpeech, Prisma } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import { searchWordsByKalenjin } from '$lib/server/kalenjin-word-search';
import {
	filterByPartOfSpeech,
	matchesMissing,
	missingWhereClause,
	parseMissing
} from '$lib/server/word-filters';
import type { PageServerLoad } from './$types';

const PER_PAGE = 50;
const MAX_PAGE = 200;
const SEARCH_LIMIT = 200;

type WordRow = {
	id: string;
	kalenjin: string;
	translations: string;
	partOfSpeech: PartOfSpeech | null;
};

function parsePage(value: string | null): number {
	const n = Number(value ?? '1');
	if (!Number.isFinite(n) || n < 1) return 1;
	if (n > MAX_PAGE) return MAX_PAGE;
	return Math.floor(n);
}

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
	const missing = parseMissing(url.searchParams.get('missing'));
	const query = (url.searchParams.get('q') ?? '').trim();
	const page = parsePage(url.searchParams.get('page'));

	const missingWhere = missingWhereClause(missing);
	const posWhere: Prisma.WordWhereInput | null = pos ? { partOfSpeech: pos } : null;
	const filterAndClauses: Prisma.WordWhereInput[] = [{ audioUrl: null }];
	if (posWhere) filterAndClauses.push(posWhere);
	if (missingWhere) filterAndClauses.push(missingWhere);
	const filterWhere: Prisma.WordWhereInput = { AND: filterAndClauses };

	let words: WordRow[];
	let total: number;
	let truncated = false;

	if (query) {
		const searched = await searchWordsByKalenjin(prisma, query, SEARCH_LIMIT);
		const scoped = searched.filter((w) => !w.audioUrl);
		const posFiltered = filterByPartOfSpeech(scoped, pos);
		const filtered = missing
			? posFiltered.filter((word) => matchesMissing(word, missing))
			: posFiltered;
		words = filtered.map(shapeWord);
		total = words.length;
		truncated = searched.length >= SEARCH_LIMIT;
	} else {
		const skip = (page - 1) * PER_PAGE;
		const [count, rows] = await Promise.all([
			prisma.word.count({ where: filterWhere }),
			prisma.word.findMany({
				where: filterWhere,
				orderBy: [{ kalenjin: 'asc' }],
				skip,
				take: PER_PAGE,
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
		page,
		perPage: PER_PAGE,
		pos: posParam,
		missing,
		q: query,
		truncated
	};
};
