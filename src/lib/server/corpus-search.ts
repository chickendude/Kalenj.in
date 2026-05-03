import { Prisma } from '@prisma/client';
import { buildEquivalentSqlSearchPattern } from '$lib/server/kalenjin-equivalence';
import { normalizeLemma } from '$lib/server/normalize-lemma';

export type CorpusSearchLanguage = 'both' | 'kalenjin' | 'english';

export function parseCorpusSearchLanguage(value: string | null): CorpusSearchLanguage {
	if (value === 'both' || value === 'kalenjin' || value === 'english') {
		return value;
	}
	return 'kalenjin';
}

export function buildCorpusSentenceSearchWhere(
	query: string,
	language: CorpusSearchLanguage,
	kalenjinSentenceIds: string[]
): Prisma.ExampleSentenceWhereInput | undefined {
	if (!query) {
		return undefined;
	}

	if (language === 'kalenjin') {
		return { id: { in: kalenjinSentenceIds } };
	}

	const englishWhere = { english: { contains: query, mode: 'insensitive' as const } };
	if (language === 'english') {
		return englishWhere;
	}

	const searchFields: Prisma.ExampleSentenceWhereInput[] = [englishWhere];
	if (kalenjinSentenceIds.length > 0) {
		searchFields.unshift({ id: { in: kalenjinSentenceIds } });
	}

	return { OR: searchFields };
}

export async function findKalenjinCorpusSentenceIds(
	prisma: {
		$queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T>;
	},
	query: string,
	limit = 500
): Promise<string[]> {
	const normalized = normalizeLemma(query);
	if (!normalized) {
		return [];
	}

	const pattern = buildEquivalentSqlSearchPattern(normalized);
	const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
		SELECT "id"
		FROM "ExampleSentence"
		WHERE "kalenjin" ~* ${pattern}
		ORDER BY "createdAt" DESC
		LIMIT ${limit}
	`);

	return rows.map((row) => row.id);
}
