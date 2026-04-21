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
};

type SearchFormKind = 'lemma' | 'plural' | 'spelling';

type SearchForm = {
	kind: SearchFormKind;
	display: string;
	normalized: string;
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

	return forms;
}

function scoreSearchFormMatch(form: SearchForm, query: string): number {
	if (!query) {
		return Number.POSITIVE_INFINITY;
	}

	const isPrimaryForm = form.kind === 'lemma';
	const alternateOffset = isPrimaryForm ? 0 : 1;

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

export function sortKalenjinSearchResults<T extends KalenjinSearchWord>(words: T[], query: string): T[] {
	return [...words].sort((left, right) => {
		const scoreDiff = scoreKalenjinWordMatch(left, query) - scoreKalenjinWordMatch(right, query);

		if (scoreDiff !== 0) {
			return scoreDiff;
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
	const equivalentSearchPattern = buildEquivalentSqlSearchPattern(normalizedQuery);
	const candidateRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
		SELECT DISTINCT w.id
		FROM "Word" w
		LEFT JOIN "WordSpelling" ws ON ws."wordId" = w.id
		WHERE
			w."kalenjinNormalized" LIKE ${containsQuery}
			OR COALESCE(w."pluralFormNormalized", '') LIKE ${containsQuery}
			OR COALESCE(ws."spellingNormalized", '') LIKE ${containsQuery}
			OR w."kalenjinNormalized" ~ ${equivalentSearchPattern}
			OR COALESCE(w."pluralFormNormalized", '') ~ ${equivalentSearchPattern}
			OR COALESCE(ws."spellingNormalized", '') ~ ${equivalentSearchPattern}
		LIMIT ${Math.max(limit * 8, 100)}
	`);

	if (candidateRows.length === 0) {
		return [];
	}

	const words = await prisma.word.findMany({
		where: {
			id: {
				in: candidateRows.map((row) => row.id)
			}
		},
		include: {
			spellings: {
				orderBy: [{ spelling: 'asc' }]
			}
		}
	});

	return sortKalenjinSearchResults(words, normalizedQuery).slice(0, limit);
}
