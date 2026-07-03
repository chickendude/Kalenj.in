import type { PartOfSpeech, Prisma } from '@prisma/client';

export type MissingFilter = '' | 'plural' | 'conjugation';

export function parseMissing(value: string | null): MissingFilter {
	return value === 'plural' || value === 'conjugation' ? value : '';
}

export type WordLikeForMissing = {
	partOfSpeech: PartOfSpeech | null;
	pluralForm: string | null;
	isPluralOnly: boolean;
	isSingularOnly: boolean;
	presentAnee: string | null;
	presentInyee: string | null;
	presentInee: string | null;
	presentEchek: string | null;
	presentOkwek: string | null;
	presentIchek: string | null;
};

export function matchesMissing(word: WordLikeForMissing, missing: MissingFilter): boolean {
	if (missing === 'plural') {
		return (
			(word.partOfSpeech === 'NOUN' || word.partOfSpeech === 'ADJECTIVE') &&
			!word.isPluralOnly &&
			!word.isSingularOnly &&
			!word.pluralForm
		);
	}
	if (missing === 'conjugation') {
		return (
			word.partOfSpeech === 'VERB' &&
			(!word.presentAnee ||
				!word.presentInyee ||
				!word.presentInee ||
				!word.presentEchek ||
				!word.presentOkwek ||
				!word.presentIchek)
		);
	}
	return true;
}

export function missingWhereClause(missing: MissingFilter): Prisma.WordWhereInput | null {
	if (missing === 'plural') {
		return {
			partOfSpeech: { in: ['NOUN', 'ADJECTIVE'] },
			isPluralOnly: false,
			isSingularOnly: false,
			pluralForm: null
		};
	}
	if (missing === 'conjugation') {
		return {
			partOfSpeech: 'VERB',
			OR: [
				{ presentAnee: null },
				{ presentInyee: null },
				{ presentInee: null },
				{ presentEchek: null },
				{ presentOkwek: null },
				{ presentIchek: null }
			]
		};
	}
	return null;
}

export function filterByPartOfSpeech<T extends { partOfSpeech: PartOfSpeech | null }>(
	words: T[],
	partOfSpeech: PartOfSpeech | null
): T[] {
	if (!partOfSpeech) return words;
	return words.filter((word) => word.partOfSpeech === partOfSpeech);
}
