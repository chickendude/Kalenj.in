import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { normalizeWordSearchQuery, sortWordSearchResults } from '$lib/server/word-search';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const query = normalizeWordSearchQuery(url.searchParams.get('q') ?? '');

	const words = await prisma.word.findMany({
		where: query
			? { kalenjin: { contains: query, mode: 'insensitive' } }
			: undefined,
		select: {
			id: true,
			kalenjin: true,
			translations: true,
			notes: true
		},
		orderBy: [{ kalenjin: 'asc' }],
		take: query ? 25 : 12
	});

	return json({
		results: sortWordSearchResults(words, query).slice(0, query ? 12 : 8)
	});
};
