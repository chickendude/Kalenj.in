import { prisma } from '$lib/server/prisma';
import type { PageServerLoad } from './$types';

type SearchLanguage = 'both' | 'english' | 'kalenjin';

function parseLanguage(value: string | null): SearchLanguage {
	if (value === 'english' || value === 'kalenjin') {
		return value;
	}

	return 'both';
}

export const load: PageServerLoad = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	const language = parseLanguage(url.searchParams.get('lang'));

	const words = await prisma.word.findMany({
		where: query
			? language === 'english'
				? { english: { contains: query, mode: 'insensitive' } }
				: language === 'kalenjin'
					? { kalenjin: { contains: query, mode: 'insensitive' } }
					: {
							OR: [
								{ english: { contains: query, mode: 'insensitive' } },
								{ kalenjin: { contains: query, mode: 'insensitive' } }
							]
						}
			: undefined,
		orderBy: [{ kalenjin: 'asc' }, { english: 'asc' }],
		take: 200
	});

	return {
		query,
		language,
		words
	};
};
