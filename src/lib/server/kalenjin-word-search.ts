import { Prisma, type PartOfSpeech } from '@prisma/client';
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
 * Collapse Kalenjin "a" and "o" vowels into a single canonical form so that
 * words like chamcham / chomchom, achame / ochome, and boiboi / baibai compare
 * as equivalent. Both vowels are mapped to "a" — the choice is arbitrary as
 * long as both sides of a comparison use the same mapping.
 */
function normalizeAoEquivalent(value: string): string {
	return value.replace(/[ao]/g, 'a');
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

	const aoQuery = normalizeAoEquivalent(query);
	const aoForm = normalizeAoEquivalent(form.normalized);
	const isPrimaryForm = form.kind === 'lemma';
	const alternateOffset = isPrimaryForm ? 0 : 1;

	if (form.normalized === query) {
		return 0 + alternateOffset;
	}

	if (aoForm === aoQuery) {
		return 2 + alternateOffset;
	}

	if (form.normalized.startsWith(query)) {
		return 4 + alternateOffset;
	}

	if (aoForm.startsWith(aoQuery)) {
		return 6 + alternateOffset;
	}

	if (form.normalized.includes(query)) {
		return 8 + alternateOffset;
	}

	if (aoForm.includes(aoQuery)) {
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
	const aoContainsQuery = `%${normalizeAoEquivalent(normalizedQuery)}%`;
	const candidateRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
		SELECT DISTINCT w.id
		FROM "Word" w
		LEFT JOIN "WordSpelling" ws ON ws."wordId" = w.id
		WHERE
			w."kalenjinNormalized" LIKE ${containsQuery}
			OR COALESCE(w."pluralFormNormalized", '') LIKE ${containsQuery}
			OR COALESCE(ws."spellingNormalized", '') LIKE ${containsQuery}
			OR translate(w."kalenjinNormalized", 'ao', 'aa') LIKE ${aoContainsQuery}
			OR translate(COALESCE(w."pluralFormNormalized", ''), 'ao', 'aa') LIKE ${aoContainsQuery}
			OR translate(COALESCE(ws."spellingNormalized", ''), 'ao', 'aa') LIKE ${aoContainsQuery}
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
