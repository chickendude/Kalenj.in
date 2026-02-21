import { prisma } from '$lib/server/prisma';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();

	const sentences = await prisma.exampleSentence.findMany({
		where: query
			? {
					OR: [
						{ kalenjin: { contains: query, mode: 'insensitive' } },
						{ english: { contains: query, mode: 'insensitive' } }
					]
				}
			: undefined,
		orderBy: { createdAt: 'desc' },
		include: {
			tokens: {
				orderBy: { tokenOrder: 'asc' },
				include: { word: true }
			},
			_count: { select: { tokens: true } }
		},
		take: 100
	});

	return {
		query,
		sentences
	};
};
