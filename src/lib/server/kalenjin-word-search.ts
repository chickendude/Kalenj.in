import { Prisma, type PartOfSpeech } from '@prisma/client';
import {
	buildEquivalentSearchRegexSource,
	buildEquivalentSqlSearchPattern,
	matchesEquivalentSearch
} from '$lib/server/kalenjin-equivalence';
import { normalizeLemma } from '$lib/server/normalize-lemma';

export type KalenjinSearchWord = {
	id: string;
	kalenjin: string;
	slug?: string;
	kalenjinNormalized: string;
	translations: string;
	partOfSpeech: PartOfSpeech | null;
	notes: string | null;
	pluralForm: string | null;
	pluralFormNormalized: string | null;
	incertainForm: string | null;
	incertainFormNormalized: string | null;
	isPluralOnly: boolean;
	isSingularOnly: boolean;
	isSwahiliLoan: boolean;
	presentAnee: string | null;
	presentInyee: string | null;
	presentInee: string | null;
	presentEchek: string | null;
	presentOkwek: string | null;
	presentIchek: string | null;
	imageUrl: string | null;
	audioUrl: string | null;
	pluralAudioUrl: string | null;
	incertainAudioUrl: string | null;
	createdAt: Date;
	updatedAt: Date;
	spellings?: Array<{
		id?: string;
		spelling: string;
		spellingNormalized: string;
	}>;
	observedForms?: ObservedSearchForm[];
};

type SearchFormKind = 'lemma' | 'plural' | 'incertain' | 'spelling' | 'observed';

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

export function normalizeKalenjinSearchQuery(query: string): string {
	return normalizeLemma(query);
}

export function parseCommaSeparatedForms(value: string): string[] {
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

	return parseCommaSeparatedForms(value)
		.map((spelling) => ({
			spelling,
			spellingNormalized: normalizeLemma(spelling)
		}))
		.filter((spelling) => spelling.spellingNormalized.length > 0)
		.filter((spelling) => spelling.spellingNormalized !== normalizedBaseLemma);
}

export function preparePluralForms(value: string) {
	const pluralForms = parseCommaSeparatedForms(value)
		.map((pluralForm) => ({
			pluralForm,
			pluralFormNormalized: normalizeLemma(pluralForm)
		}))
		.filter((pluralForm) => pluralForm.pluralFormNormalized.length > 0);

	return {
		pluralForm: pluralForms.length
			? pluralForms.map((pluralForm) => pluralForm.pluralForm).join(', ')
			: null,
		pluralFormNormalized: pluralForms.length
			? pluralForms.map((pluralForm) => pluralForm.pluralFormNormalized).join(', ')
			: null
	};
}

/**
 * Prepare the incertain singular form(s) for storage. Like plural forms this can
 * hold a primary value plus comma-separated alternatives, stored as a comma-joined
 * list with a parallel comma-joined normalized list for search.
 */
export function prepareIncertainForm(value: string) {
	const { pluralForm, pluralFormNormalized } = preparePluralForms(value);

	return { incertainForm: pluralForm, incertainFormNormalized: pluralFormNormalized };
}

function collectSearchForms(word: KalenjinSearchWord): SearchForm[] {
	const forms: SearchForm[] = [
		{
			kind: 'lemma',
			display: word.kalenjin,
			normalized: word.kalenjinNormalized
		}
	];

	for (const pluralForm of parseCommaSeparatedForms(word.pluralForm ?? '')) {
		forms.push({
			kind: 'plural',
			display: pluralForm,
			normalized: normalizeLemma(pluralForm)
		});
	}

	for (const incertainForm of parseCommaSeparatedForms(word.incertainForm ?? '')) {
		forms.push({
			kind: 'incertain',
			display: incertainForm,
			normalized: normalizeLemma(incertainForm)
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
		...collectSearchForms(word).map((form) => scoreSearchFormMatch(form, normalizedQuery))
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

	const containsQuery = `%${normalizedQuery}%`;
	const prefixQuery = `${normalizedQuery}%`;
	const candidateLimit = Math.max(limit * 12, 150);
	const equivalentSearchPattern = buildEquivalentSqlSearchPattern(normalizedQuery);
	const exactEquivalentSearchPattern = `^${equivalentSearchPattern}$`;
	const prefixEquivalentSearchPattern = `^${equivalentSearchPattern}`;

	const textualRowsPromise = prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
		WITH textual_candidates AS (
			SELECT
				w.id,
				NULL::text AS "observedNormalizedForm",
				NULL::integer AS "observedUsageCount",
				0 AS "sourceRank",
				MIN(
					CASE
						WHEN w."kalenjinNormalized" = ${normalizedQuery} THEN 0
						WHEN ${normalizedQuery} = ANY(
							string_to_array(COALESCE(w."pluralFormNormalized", ''), ', ')
						) THEN 1
						WHEN ${normalizedQuery} = ANY(
							string_to_array(COALESCE(w."incertainFormNormalized", ''), ', ')
						) THEN 1
						WHEN COALESCE(ws."spellingNormalized", '') = ${normalizedQuery} THEN 2
						WHEN w."kalenjinNormalized" LIKE ${prefixQuery} THEN 3
						WHEN EXISTS (
							SELECT 1
							FROM unnest(string_to_array(COALESCE(w."pluralFormNormalized", ''), ', ')) AS pf
							WHERE pf LIKE ${prefixQuery}
						) THEN 4
						WHEN EXISTS (
							SELECT 1
							FROM unnest(string_to_array(COALESCE(w."incertainFormNormalized", ''), ', ')) AS inf
							WHERE inf LIKE ${prefixQuery}
						) THEN 4
						WHEN COALESCE(ws."spellingNormalized", '') LIKE ${prefixQuery} THEN 5
						ELSE 6
					END
				) AS "matchRank"
			FROM "Word" w
			LEFT JOIN "WordSpelling" ws ON ws."wordId" = w.id
			WHERE
				w."kalenjinNormalized" LIKE ${containsQuery}
				OR COALESCE(w."pluralFormNormalized", '') LIKE ${containsQuery}
				OR COALESCE(w."incertainFormNormalized", '') LIKE ${containsQuery}
				OR COALESCE(ws."spellingNormalized", '') LIKE ${containsQuery}
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
					WHEN owf."normalizedForm" = ${normalizedQuery} THEN 0
					WHEN owf."normalizedForm" LIKE ${prefixQuery} THEN 3
					ELSE 6
				END AS "matchRank"
			FROM "ObservedWordForm" owf
			WHERE
				owf."normalizedForm" LIKE ${containsQuery}
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

	const equivalentRowsPromise = prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
		WITH textual_candidates AS (
			SELECT
				w.id,
				NULL::text AS "observedNormalizedForm",
				NULL::integer AS "observedUsageCount",
				0 AS "sourceRank",
				MIN(
					CASE
						WHEN w."kalenjinNormalized" ~ ${exactEquivalentSearchPattern} THEN 2
						WHEN EXISTS (
							SELECT 1
							FROM unnest(string_to_array(COALESCE(w."pluralFormNormalized", ''), ', ')) AS pf
							WHERE pf ~ ${exactEquivalentSearchPattern}
						) THEN 3
						WHEN EXISTS (
							SELECT 1
							FROM unnest(string_to_array(COALESCE(w."incertainFormNormalized", ''), ', ')) AS inf
							WHERE inf ~ ${exactEquivalentSearchPattern}
						) THEN 3
						WHEN COALESCE(ws."spellingNormalized", '') ~ ${exactEquivalentSearchPattern} THEN 4
						WHEN w."kalenjinNormalized" ~ ${prefixEquivalentSearchPattern} THEN 6
						WHEN EXISTS (
							SELECT 1
							FROM unnest(string_to_array(COALESCE(w."pluralFormNormalized", ''), ', ')) AS pf
							WHERE pf ~ ${prefixEquivalentSearchPattern}
						) THEN 7
						WHEN EXISTS (
							SELECT 1
							FROM unnest(string_to_array(COALESCE(w."incertainFormNormalized", ''), ', ')) AS inf
							WHERE inf ~ ${prefixEquivalentSearchPattern}
						) THEN 7
						WHEN COALESCE(ws."spellingNormalized", '') ~ ${prefixEquivalentSearchPattern} THEN 8
						ELSE 10
					END
				) AS "matchRank"
			FROM "Word" w
			LEFT JOIN "WordSpelling" ws ON ws."wordId" = w.id
			WHERE
				w."kalenjinNormalized" ~ ${equivalentSearchPattern}
				OR COALESCE(w."pluralFormNormalized", '') ~ ${equivalentSearchPattern}
				OR COALESCE(w."incertainFormNormalized", '') ~ ${equivalentSearchPattern}
				OR COALESCE(ws."spellingNormalized", '') ~ ${equivalentSearchPattern}
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
					WHEN owf."normalizedForm" ~ ${exactEquivalentSearchPattern} THEN 2
					WHEN owf."normalizedForm" ~ ${prefixEquivalentSearchPattern} THEN 6
					ELSE 10
				END AS "matchRank"
			FROM "ObservedWordForm" owf
			WHERE
				owf."normalizedForm" ~ ${equivalentSearchPattern}
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

	const [textualRows, equivalentRows] = await Promise.all([
		textualRowsPromise,
		equivalentRowsPromise
	]);
	const candidateRows = [...textualRows, ...equivalentRows];

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
