import { json } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/prisma';
import { buildEquivalentSqlSearchPattern } from '$lib/server/kalenjin-equivalence';
import { normalizeLemma } from '$lib/server/normalize-lemma';
import type { RequestHandler } from './$types';

const MAX_RESULTS = 5;

type SearchResult = {
	id: string;
	kalenjin: string;
	english: string;
};

function stripPunctuation(value: string): string {
	return value.replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

export const GET: RequestHandler = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	if (query.length < 3) {
		return json({ results: [] satisfies SearchResult[] });
	}

	const normalized = normalizeLemma(stripPunctuation(query));
	if (!normalized) {
		return json({ results: [] satisfies SearchResult[] });
	}

	const anchoredPattern = `^[[:space:]]*${buildEquivalentSqlSearchPattern(normalized)}`;

	const rows = await prisma.$queryRaw<SearchResult[]>(Prisma.sql`
		SELECT id, kalenjin, english
		FROM "ExampleSentence"
		WHERE regexp_replace(
			regexp_replace("kalenjin", '[[:punct:]]+', ' ', 'g'),
			'[[:space:]]+',
			' ',
			'g'
		) ~* ${anchoredPattern}
		ORDER BY "createdAt" DESC
		LIMIT ${MAX_RESULTS}
	`);

	return json({ results: rows });
};
