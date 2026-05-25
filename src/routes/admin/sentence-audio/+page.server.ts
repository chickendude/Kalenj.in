import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import {
	buildCorpusSentenceSearchWhere,
	findKalenjinCorpusSentenceIds,
	parseCorpusSearchLanguage
} from '$lib/server/corpus-search';
import type { PageServerLoad } from './$types';

const FETCH_LIMIT = 50;

type SentenceRow = {
	id: string;
	kalenjin: string;
	english: string;
};

export const load: PageServerLoad = async ({ locals, url }) => {
	requireEditor(locals);

	const query = (url.searchParams.get('q') ?? '').trim();
	const language = parseCorpusSearchLanguage(url.searchParams.get('lang'));

	const kalenjinSentenceIds =
		query && language !== 'english' ? await findKalenjinCorpusSentenceIds(prisma, query) : [];
	const searchWhere = buildCorpusSentenceSearchWhere(query, language, kalenjinSentenceIds);

	const baseWhere: Prisma.ExampleSentenceWhereInput = {
		audioUrl: null,
		NOT: { kalenjin: '' }
	};
	const where: Prisma.ExampleSentenceWhereInput = searchWhere
		? { AND: [baseWhere, searchWhere] }
		: baseWhere;

	const [count, rows] = await Promise.all([
		prisma.exampleSentence.count({ where }),
		prisma.exampleSentence.findMany({
			where,
			orderBy: query ? { createdAt: 'desc' } : [{ kalenjin: 'asc' }],
			take: FETCH_LIMIT,
			select: {
				id: true,
				kalenjin: true,
				english: true
			}
		})
	]);

	const sentences: SentenceRow[] = rows.map((row) => ({
		id: row.id,
		kalenjin: row.kalenjin,
		english: row.english
	}));

	return {
		sentences,
		total: count,
		fetchLimit: FETCH_LIMIT,
		q: query,
		language
	};
};
