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
	isPluralOnly: boolean;
	presentAnee: string | null;
	presentInyee: string | null;
	presentInee: string | null;
	presentEchek: string | null;
	presentOkwek: string | null;
	presentIchek: string | null;
	imageUrl: string | null;
	audioUrl: string | null;
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
	let candidateRows = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
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
						WHEN COALESCE(ws."spellingNormalized", '') = ${normalizedQuery} THEN 2
						WHEN w."kalenjinNormalized" LIKE ${prefixQuery} THEN 3
						WHEN EXISTS (
							SELECT 1
							FROM unnest(string_to_array(COALESCE(w."pluralFormNormalized", ''), ', ')) AS pf
							WHERE pf LIKE ${prefixQuery}
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

	if (candidateRows.length === 0) {
		const equivalentSearchPattern = buildEquivalentSqlSearchPattern(normalizedQuery);
		const exactEquivalentSearchPattern = `^${equivalentSearchPattern}$`;
		const prefixEquivalentSearchPattern = `^${equivalentSearchPattern}`;

		candidateRows = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
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
							WHEN COALESCE(ws."spellingNormalized", '') ~ ${exactEquivalentSearchPattern} THEN 4
							WHEN w."kalenjinNormalized" ~ ${prefixEquivalentSearchPattern} THEN 6
							WHEN EXISTS (
								SELECT 1
								FROM unnest(string_to_array(COALESCE(w."pluralFormNormalized", ''), ', ')) AS pf
								WHERE pf ~ ${prefixEquivalentSearchPattern}
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
