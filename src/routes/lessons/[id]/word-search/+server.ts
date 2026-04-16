import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { normalizeKalenjinSearchQuery, searchWordsByKalenjin } from '$lib/server/kalenjin-word-search';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const query = normalizeKalenjinSearchQuery(url.searchParams.get('q') ?? '');
	const words = await searchWordsByKalenjin(prisma, query, query ? 12 : 8);

	return json({
		results: words.map((word) => ({
			id: word.id,
			kalenjin: word.kalenjin,
			translations: word.translations,
			notes: word.notes ?? null
		}))
	});
};
