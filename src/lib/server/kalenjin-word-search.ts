import { Prisma, type PartOfSpeech } from '@prisma/client';
import {
	APOSTROPHE_REGEX_SOURCE,
	canInsertOptionalApostropheAfter,
	hasSearchApostrophe,
	isSearchApostrophe
} from '$lib/server/apostrophe-search';
import { normalizeLemma } from '$lib/server/normalize-lemma';

export type KalenjinSearchWord = {
	id: string;
	kalenjin: string;
	kalenjinNormalized: string;
	translations: string;
	partOfSpeech: PartOfSpeech | null;
	notes: string | null;
	pluralForm: string | null;
	pluralFormNormalized: string | null;
	createdAt: Date;
	updatedAt: Date;
	spellings?: Array<{
		id?: string;
		spelling: string;
		spellingNormalized: string;
	}>;
	observedForms?: ObservedSearchForm[];
};

type SearchFormKind = 'lemma' | 'plural' | 'spelling' | 'observed';

type ObservedSearchForm = {
	normalizedForm: string;
	usageCount: number;
};

type CandidateRow = {
	id: string;
	observedNormalizedForm: string | null;
	observedUsageCount: number | null;
	matchRank: number;
	sourceRank: number;
};

type SearchForm = {
	kind: SearchFormKind;
	display: string;
	normalized: string;
	usageCount?: number;
};

type SearchQueryVariant = {
	normalized: string;
	scoreOffset: number;
};

/**
 * Build a search pattern for Kalenjin letters that are commonly interchanged:
 * a/o and k/g anywhere, plus p/b only at word endings.
 */
function buildEquivalentSearchRegexSource(query: string, sql = false): string {
	const whitespace = sql ? '[[:space:]]+' : '\\s+';
	const allowOptionalApostrophes = !hasSearchApostrophe(query);
	let source = '';

	for (let index = 0; index < query.length; index += 1) {
		const char = query[index];
		const nextChar = query[index + 1];
		const isWordFinal = !nextChar || /\s/.test(nextChar);

		if (/\s/.test(char)) {
			source += whitespace;
		} else if (isSearchApostrophe(char)) {
			source += APOSTROPHE_REGEX_SOURCE;
		} else if (char === 'a' || char === 'o') {
			source += '[ao]';
		} else if (char === 'k' || char === 'g') {
			source += '[kg]';
		} else if ((char === 'p' || char === 'b') && isWordFinal) {
			source += sql ? (nextChar ? '[pb]' : '[pb]($|[[:space:]])') : '[pb](?=$|\\s)';
		} else {
			source += char.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
		}

		if (allowOptionalApostrophes && canInsertOptionalApostropheAfter(char, nextChar)) {
			source += `${APOSTROPHE_REGEX_SOURCE}?`;
		}
	}

	return source;
}

function matchesEquivalentSearch(form: string, query: string, mode: 'exact' | 'prefix' | 'contains') {
	const source = buildEquivalentSearchRegexSource(query);
	const pattern =
		mode === 'exact' ? `^${source}$` : mode === 'prefix' ? `^${source}` : source;

	return new RegExp(pattern).test(form);
}

function buildEquivalentSqlSearchPattern(query: string): string {
	return buildEquivalentSearchRegexSource(query, true);
}

function searchQueryVariants(normalizedQuery: string): SearchQueryVariant[] {
	const variants: SearchQueryVariant[] = [{ normalized: normalizedQuery, scoreOffset: 0 }];

	if (normalizedQuery.startsWith('ko') && normalizedQuery.length > 3) {
		const stem = normalizedQuery.slice(2);
		if (stem.length > 1 && stem !== normalizedQuery) {
			variants.push({ normalized: stem, scoreOffset: 3 });
		}
	}

	return variants;
}

function sqlTextArray(values: string[]): Prisma.Sql {
	return Prisma.sql`ARRAY[${Prisma.join(values)}]::text[]`;
}

function sqlEqualsAny(column: Prisma.Sql, values: string[]): Prisma.Sql {
	return Prisma.sql`${column} = ANY (${sqlTextArray(values)})`;
}

function sqlLikeAny(column: Prisma.Sql, patterns: string[]): Prisma.Sql {
	return Prisma.sql`${column} LIKE ANY (${sqlTextArray(patterns)})`;
}

function sqlRegexAny(column: Prisma.Sql, patterns: string[]): Prisma.Sql {
	return Prisma.sql`${column} ~ ANY (${sqlTextArray(patterns)})`;
}

export function normalizeKalenjinSearchQuery(query: string): string {
	return normalizeLemma(query);
}

export function parseAlternativeSpellings(value: string): string[] {
	const seen = new Set<string>();

	return value
		.split(/[\r\n,]+/)
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.filter((entry) => {
			const normalized = normalizeLemma(entry);
			if (!normalized || seen.has(normalized)) {
				return false;
			}

			seen.add(normalized);
			return true;
		});
}

export function prepareAlternativeSpellings(value: string, baseLemma?: string) {
	const normalizedBaseLemma = baseLemma ? normalizeLemma(baseLemma) : '';

	return parseAlternativeSpellings(value)
		.map((spelling) => ({
			spelling,
			spellingNormalized: normalizeLemma(spelling)
		}))
		.filter((spelling) => spelling.spellingNormalized.length > 0)
		.filter((spelling) => spelling.spellingNormalized !== normalizedBaseLemma);
}

function collectSearchForms(word: KalenjinSearchWord): SearchForm[] {
	const forms: SearchForm[] = [
		{
			kind: 'lemma',
			display: word.kalenjin,
			normalized: word.kalenjinNormalized
		}
	];

	if (word.pluralForm && word.pluralFormNormalized) {
		forms.push({
			kind: 'plural',
			display: word.pluralForm,
			normalized: word.pluralFormNormalized
		});
	}

	for (const spelling of word.spellings ?? []) {
		forms.push({
			kind: 'spelling',
			display: spelling.spelling,
			normalized: spelling.spellingNormalized
		});
	}

	for (const form of word.observedForms ?? []) {
		forms.push({
			kind: 'observed',
			display: form.normalizedForm,
			normalized: form.normalizedForm,
			usageCount: form.usageCount
		});
	}

	return forms;
}

function scoreSearchFormMatch(form: SearchForm, query: string): number {
	if (!query) {
		return Number.POSITIVE_INFINITY;
	}

	const alternateOffset = form.kind === 'lemma' ? 0 : form.kind === 'observed' ? 1.5 : 1;

	if (form.normalized === query) {
		return 0 + alternateOffset;
	}

	if (matchesEquivalentSearch(form.normalized, query, 'exact')) {
		return 2 + alternateOffset;
	}

	if (form.normalized.startsWith(query)) {
		return 4 + alternateOffset;
	}

	if (matchesEquivalentSearch(form.normalized, query, 'prefix')) {
		return 6 + alternateOffset;
	}

	if (form.normalized.includes(query)) {
		return 8 + alternateOffset;
	}

	if (matchesEquivalentSearch(form.normalized, query, 'contains')) {
		return 10 + alternateOffset;
	}

	return Number.POSITIVE_INFINITY;
}

export function scoreKalenjinWordMatch(word: KalenjinSearchWord, query: string): number {
	const normalizedQuery = normalizeKalenjinSearchQuery(query);

	if (!normalizedQuery) {
		return Number.POSITIVE_INFINITY;
	}

	return Math.min(
		...collectSearchForms(word).flatMap((form) =>
			searchQueryVariants(normalizedQuery).map(
				(variant) => scoreSearchFormMatch(form, variant.normalized) + variant.scoreOffset
			)
		)
	);
}

function observedUsage(word: KalenjinSearchWord): number {
	return Math.max(0, ...(word.observedForms ?? []).map((form) => form.usageCount));
}

export function sortKalenjinSearchResults<T extends KalenjinSearchWord>(words: T[], query: string): T[] {
	return [...words].sort((left, right) => {
		const scoreDiff = scoreKalenjinWordMatch(left, query) - scoreKalenjinWordMatch(right, query);

		if (scoreDiff !== 0) {
			return scoreDiff;
		}

		const usageDiff = observedUsage(right) - observedUsage(left);
		if (usageDiff !== 0) {
			return usageDiff;
		}

		const lemmaDiff = left.kalenjin.localeCompare(right.kalenjin);
		if (lemmaDiff !== 0) {
			return lemmaDiff;
		}

		return left.translations.localeCompare(right.translations);
	});
}

export async function searchWordsByKalenjin(
	prisma: {
		$queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T>;
		word: {
			findMany: (args: Prisma.WordFindManyArgs) => Promise<KalenjinSearchWord[]>;
		};
	},
	query: string,
	limit: number
): Promise<KalenjinSearchWord[]> {
	const normalizedQuery = normalizeKalenjinSearchQuery(query);

	if (!normalizedQuery) {
		return prisma.word.findMany({
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			include: {
				spellings: {
					orderBy: [{ spelling: 'asc' }]
				}
			},
			take: limit
		});
	}

	const queryVariants = searchQueryVariants(normalizedQuery);
	const exactQueries = queryVariants.map((variant) => variant.normalized);
	const containsQueries = queryVariants.map((variant) => `%${variant.normalized}%`);
	const prefixQueries = queryVariants.map((variant) => `${variant.normalized}%`);
	const candidateLimit = Math.max(limit * 12, 150);
	let candidateRows = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
		WITH textual_candidates AS (
			SELECT
				w.id,
				NULL::text AS "observedNormalizedForm",
				NULL::integer AS "observedUsageCount",
				0 AS "sourceRank",
				MIN(
					CASE
						WHEN ${sqlEqualsAny(Prisma.sql`w."kalenjinNormalized"`, exactQueries)} THEN 0
						WHEN ${sqlEqualsAny(Prisma.sql`COALESCE(w."pluralFormNormalized", '')`, exactQueries)} THEN 1
						WHEN ${sqlEqualsAny(Prisma.sql`COALESCE(ws."spellingNormalized", '')`, exactQueries)} THEN 2
						WHEN ${sqlLikeAny(Prisma.sql`w."kalenjinNormalized"`, prefixQueries)} THEN 3
						WHEN ${sqlLikeAny(Prisma.sql`COALESCE(w."pluralFormNormalized", '')`, prefixQueries)} THEN 4
						WHEN ${sqlLikeAny(Prisma.sql`COALESCE(ws."spellingNormalized", '')`, prefixQueries)} THEN 5
						ELSE 6
					END
				) AS "matchRank"
			FROM "Word" w
			LEFT JOIN "WordSpelling" ws ON ws."wordId" = w.id
			WHERE
				${sqlLikeAny(Prisma.sql`w."kalenjinNormalized"`, containsQueries)}
				OR ${sqlLikeAny(Prisma.sql`COALESCE(w."pluralFormNormalized", '')`, containsQueries)}
				OR ${sqlLikeAny(Prisma.sql`COALESCE(ws."spellingNormalized", '')`, containsQueries)}
			GROUP BY w.id
			ORDER BY "matchRank", w.id
			LIMIT ${candidateLimit}
		),
		observed_per_word AS (
			SELECT DISTINCT ON (owf."wordId")
				owf."wordId" AS id,
				owf."normalizedForm" AS "observedNormalizedForm",
				owf."usageCount" AS "observedUsageCount",
				1 AS "sourceRank",
				CASE
					WHEN ${sqlEqualsAny(Prisma.sql`owf."normalizedForm"`, exactQueries)} THEN 0
					WHEN ${sqlLikeAny(Prisma.sql`owf."normalizedForm"`, prefixQueries)} THEN 3
					ELSE 6
				END AS "matchRank"
			FROM "ObservedWordForm" owf
			WHERE
				${sqlLikeAny(Prisma.sql`owf."normalizedForm"`, containsQueries)}
			ORDER BY owf."wordId", "matchRank", owf."usageCount" DESC, owf."normalizedForm"
		),
		observed_candidates AS (
			SELECT id, "observedNormalizedForm", "observedUsageCount", "matchRank", "sourceRank"
			FROM observed_per_word
			ORDER BY "matchRank", "sourceRank", "observedUsageCount" DESC, id
			LIMIT ${candidateLimit}
		)
		SELECT id, "observedNormalizedForm", "observedUsageCount", "matchRank", "sourceRank"
		FROM textual_candidates
		UNION ALL
		SELECT id, "observedNormalizedForm", "observedUsageCount", "matchRank", "sourceRank"
		FROM observed_candidates
		ORDER BY "matchRank", "sourceRank", "observedUsageCount" DESC NULLS LAST, id
		LIMIT ${candidateLimit}
	`);

	if (candidateRows.length === 0) {
		const equivalentSearchPatterns = queryVariants.map((variant) =>
			buildEquivalentSqlSearchPattern(variant.normalized)
		);
		const exactEquivalentSearchPatterns = equivalentSearchPatterns.map((pattern) => `^${pattern}$`);
		const prefixEquivalentSearchPatterns = equivalentSearchPatterns.map((pattern) => `^${pattern}`);

		candidateRows = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
			WITH textual_candidates AS (
				SELECT
					w.id,
					NULL::text AS "observedNormalizedForm",
					NULL::integer AS "observedUsageCount",
					0 AS "sourceRank",
					MIN(
						CASE
							WHEN ${sqlRegexAny(Prisma.sql`w."kalenjinNormalized"`, exactEquivalentSearchPatterns)} THEN 2
							WHEN ${sqlRegexAny(Prisma.sql`COALESCE(w."pluralFormNormalized", '')`, exactEquivalentSearchPatterns)} THEN 3
							WHEN ${sqlRegexAny(Prisma.sql`COALESCE(ws."spellingNormalized", '')`, exactEquivalentSearchPatterns)} THEN 4
							WHEN ${sqlRegexAny(Prisma.sql`w."kalenjinNormalized"`, prefixEquivalentSearchPatterns)} THEN 6
							WHEN ${sqlRegexAny(Prisma.sql`COALESCE(w."pluralFormNormalized", '')`, prefixEquivalentSearchPatterns)} THEN 7
							WHEN ${sqlRegexAny(Prisma.sql`COALESCE(ws."spellingNormalized", '')`, prefixEquivalentSearchPatterns)} THEN 8
							ELSE 10
						END
					) AS "matchRank"
				FROM "Word" w
				LEFT JOIN "WordSpelling" ws ON ws."wordId" = w.id
				WHERE
					${sqlRegexAny(Prisma.sql`w."kalenjinNormalized"`, equivalentSearchPatterns)}
					OR ${sqlRegexAny(Prisma.sql`COALESCE(w."pluralFormNormalized", '')`, equivalentSearchPatterns)}
					OR ${sqlRegexAny(Prisma.sql`COALESCE(ws."spellingNormalized", '')`, equivalentSearchPatterns)}
				GROUP BY w.id
				ORDER BY "matchRank", w.id
				LIMIT ${candidateLimit}
			),
			observed_per_word AS (
				SELECT DISTINCT ON (owf."wordId")
					owf."wordId" AS id,
					owf."normalizedForm" AS "observedNormalizedForm",
					owf."usageCount" AS "observedUsageCount",
					1 AS "sourceRank",
					CASE
						WHEN ${sqlRegexAny(Prisma.sql`owf."normalizedForm"`, exactEquivalentSearchPatterns)} THEN 2
						WHEN ${sqlRegexAny(Prisma.sql`owf."normalizedForm"`, prefixEquivalentSearchPatterns)} THEN 6
						ELSE 10
					END AS "matchRank"
				FROM "ObservedWordForm" owf
				WHERE
					${sqlRegexAny(Prisma.sql`owf."normalizedForm"`, equivalentSearchPatterns)}
				ORDER BY owf."wordId", "matchRank", owf."usageCount" DESC, owf."normalizedForm"
			),
			observed_candidates AS (
				SELECT id, "observedNormalizedForm", "observedUsageCount", "matchRank", "sourceRank"
				FROM observed_per_word
				ORDER BY "matchRank", "sourceRank", "observedUsageCount" DESC, id
				LIMIT ${candidateLimit}
			)
			SELECT id, "observedNormalizedForm", "observedUsageCount", "matchRank", "sourceRank"
			FROM textual_candidates
			UNION ALL
			SELECT id, "observedNormalizedForm", "observedUsageCount", "matchRank", "sourceRank"
			FROM observed_candidates
			ORDER BY "matchRank", "sourceRank", "observedUsageCount" DESC NULLS LAST, id
			LIMIT ${candidateLimit}
		`);
	}

	if (candidateRows.length === 0) {
		return [];
	}

	const observedFormsByWordId = new Map<string, ObservedSearchForm[]>();
	for (const row of candidateRows) {
		if (!row.observedNormalizedForm) {
			continue;
		}

		const forms = observedFormsByWordId.get(row.id) ?? [];
		if (!forms.some((form) => form.normalizedForm === row.observedNormalizedForm)) {
			forms.push({
				normalizedForm: row.observedNormalizedForm,
				usageCount: row.observedUsageCount ?? 0
			});
		}
		observedFormsByWordId.set(row.id, forms);
	}

	const candidateIds = [...new Set(candidateRows.map((row) => row.id))];

	const words = await prisma.word.findMany({
		where: {
			id: {
				in: candidateIds
			}
		},
		include: {
			spellings: {
				orderBy: [{ spelling: 'asc' }]
			}
		}
	});

	const wordsWithObservedForms = words.map((word) => ({
		...word,
		observedForms: observedFormsByWordId.get(word.id) ?? []
	}));

	return sortKalenjinSearchResults(wordsWithObservedForms, normalizedQuery).slice(0, limit);
}
