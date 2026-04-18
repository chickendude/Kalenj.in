import { prisma } from '$lib/server/prisma';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import type { PageServerLoad } from './$types';

type SearchLanguage = 'both' | 'english' | 'kalenjin';

function parseLanguage(value: string | null): SearchLanguage {
	if (value === 'english' || value === 'kalenjin') return value;
	return 'kalenjin';
}

export const load: PageServerLoad = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	const language = parseLanguage(url.searchParams.get('lang'));
	const posParam = url.searchParams.get('pos') ?? '';
	const pos = isPartOfSpeech(posParam) ? posParam : null;

	const [words, totalCount] = await Promise.all([
		prisma.word.findMany({
			where: {
				...(pos ? { partOfSpeech: pos } : {}),
				...(query
					? language === 'english'
						? { translations: { contains: query, mode: 'insensitive' } }
						: language === 'kalenjin'
							? { kalenjin: { contains: query, mode: 'insensitive' } }
							: {
									OR: [
										{ translations: { contains: query, mode: 'insensitive' } },
										{ kalenjin: { contains: query, mode: 'insensitive' } }
									]
								}
					: {})
			},
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: 200
		}),
		prisma.word.count()
	]);

	return { query, language, pos: posParam, words, totalCount };
};
