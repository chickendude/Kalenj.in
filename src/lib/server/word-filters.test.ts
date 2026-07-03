import { describe, expect, it } from 'vitest';
import {
	filterByPartOfSpeech,
	matchesMissing,
	missingWhereClause,
	parseMissing,
	type WordLikeForMissing
} from './word-filters';

function noun(overrides: Partial<WordLikeForMissing> = {}): WordLikeForMissing {
	return {
		partOfSpeech: 'NOUN',
		pluralForm: null,
		isPluralOnly: false,
		isSingularOnly: false,
		presentAnee: null,
		presentInyee: null,
		presentInee: null,
		presentEchek: null,
		presentOkwek: null,
		presentIchek: null,
		...overrides
	};
}

function verb(overrides: Partial<WordLikeForMissing> = {}): WordLikeForMissing {
	return noun({
		partOfSpeech: 'VERB',
		...overrides
	});
}

describe('parseMissing', () => {
	it('accepts the two known filter values', () => {
		expect(parseMissing('plural')).toBe('plural');
		expect(parseMissing('conjugation')).toBe('conjugation');
	});

	it('falls back to empty string for unknown or null input', () => {
		expect(parseMissing('garbage')).toBe('');
		expect(parseMissing('')).toBe('');
		expect(parseMissing(null)).toBe('');
	});
});

describe('matchesMissing — plural filter', () => {
	it('matches a noun without a plural form', () => {
		expect(matchesMissing(noun(), 'plural')).toBe(true);
	});

	it('matches an adjective without a plural form', () => {
		expect(matchesMissing(noun({ partOfSpeech: 'ADJECTIVE' }), 'plural')).toBe(true);
	});

	it('does not match a noun with a plural form already set', () => {
		expect(matchesMissing(noun({ pluralForm: 'kingsiek' }), 'plural')).toBe(false);
	});

	it('does not match a plural-only noun', () => {
		expect(matchesMissing(noun({ isPluralOnly: true }), 'plural')).toBe(false);
	});

	it('does not match a singular-only noun', () => {
		expect(matchesMissing(noun({ isSingularOnly: true }), 'plural')).toBe(false);
	});

	it('does not match a verb', () => {
		expect(matchesMissing(verb(), 'plural')).toBe(false);
	});
});

describe('matchesMissing — conjugation filter', () => {
	it('matches a verb missing any present-tense form', () => {
		expect(matchesMissing(verb(), 'conjugation')).toBe(true);
	});

	it('matches a verb with some but not all present forms', () => {
		expect(
			matchesMissing(verb({ presentAnee: 'achobe', presentInyee: 'ichobe' }), 'conjugation')
		).toBe(true);
	});

	it('does not match a fully conjugated verb', () => {
		expect(
			matchesMissing(
				verb({
					presentAnee: 'a',
					presentInyee: 'b',
					presentInee: 'c',
					presentEchek: 'd',
					presentOkwek: 'e',
					presentIchek: 'f'
				}),
				'conjugation'
			)
		).toBe(false);
	});

	it('does not match a noun', () => {
		expect(matchesMissing(noun(), 'conjugation')).toBe(false);
	});
});

describe('matchesMissing — no filter', () => {
	it('matches anything when filter is empty', () => {
		expect(matchesMissing(noun(), '')).toBe(true);
		expect(matchesMissing(verb(), '')).toBe(true);
	});
});

describe('missingWhereClause', () => {
	it('builds the plural where-clause for prisma', () => {
		expect(missingWhereClause('plural')).toEqual({
			partOfSpeech: { in: ['NOUN', 'ADJECTIVE'] },
			isPluralOnly: false,
			isSingularOnly: false,
			pluralForm: null
		});
	});

	it('builds the conjugation where-clause with all six OR branches', () => {
		const clause = missingWhereClause('conjugation');
		expect(clause).toMatchObject({ partOfSpeech: 'VERB' });
		expect(clause?.OR).toHaveLength(6);
	});

	it('returns null when no filter is set', () => {
		expect(missingWhereClause('')).toBeNull();
	});
});

describe('filterByPartOfSpeech', () => {
	const words = [
		{ id: 'a', partOfSpeech: 'NOUN' as const },
		{ id: 'b', partOfSpeech: 'VERB' as const },
		{ id: 'c', partOfSpeech: 'NOUN' as const },
		{ id: 'd', partOfSpeech: null }
	];

	it('returns the input array unchanged when no filter is set', () => {
		expect(filterByPartOfSpeech(words, null)).toBe(words);
	});

	it('keeps only words matching the requested part of speech', () => {
		expect(filterByPartOfSpeech(words, 'NOUN').map((w) => w.id)).toEqual(['a', 'c']);
		expect(filterByPartOfSpeech(words, 'VERB').map((w) => w.id)).toEqual(['b']);
	});
});
