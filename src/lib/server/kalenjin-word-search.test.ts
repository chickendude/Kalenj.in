import { describe, expect, it } from 'vitest';
import {
	normalizeKalenjinSearchQuery,
	parseAlternativeSpellings,
	prepareAlternativeSpellings,
	scoreKalenjinWordMatch,
	sortKalenjinSearchResults
} from './kalenjin-word-search';

const WORDS = [
	{
		id: '1',
		kalenjin: 'chamcham',
		kalenjinNormalized: 'chamcham',
		translations: 'taste',
		partOfSpeech: null,
		notes: null,
		pluralForm: null,
		pluralFormNormalized: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		spellings: []
	},
	{
		id: '2',
		kalenjin: 'missing',
		kalenjinNormalized: 'missing',
		translations: 'hello',
		partOfSpeech: null,
		notes: null,
		pluralForm: null,
		pluralFormNormalized: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		spellings: [{ spelling: 'misseng', spellingNormalized: 'misseng' }]
	},
	{
		id: '3',
		kalenjin: 'kot',
		kalenjinNormalized: 'kot',
		translations: 'house',
		partOfSpeech: null,
		notes: null,
		pluralForm: null,
		pluralFormNormalized: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		spellings: [{ spelling: 'koot', spellingNormalized: 'koot' }]
	}
];

describe('normalizeKalenjinSearchQuery', () => {
	it('strips punctuation and lowercases while keeping apostrophes', () => {
		expect(normalizeKalenjinSearchQuery('"Koit\'a?!"')).toBe("koit'a");
	});
});

describe('parseAlternativeSpellings', () => {
	it('parses comma or newline separated spellings and deduplicates by normalized spelling', () => {
		expect(parseAlternativeSpellings('  misseng,\n\nkoot, Misseng\n')).toEqual([
			'misseng',
			'koot'
		]);
	});
});

describe('prepareAlternativeSpellings', () => {
	it('removes spellings that duplicate the base lemma', () => {
		expect(prepareAlternativeSpellings('chamcham\nchomchom\n', 'chamcham')).toEqual([
			{ spelling: 'chomchom', spellingNormalized: 'chomchom' }
		]);
	});
});

describe('scoreKalenjinWordMatch', () => {
	it('treats a/o as equivalent for base lemma matching', () => {
		expect(scoreKalenjinWordMatch(WORDS[0], 'chomchom')).toBe(2);
		expect(scoreKalenjinWordMatch(WORDS[0], 'chamcham')).toBe(0);
	});

	it('matches alternative spellings', () => {
		expect(scoreKalenjinWordMatch(WORDS[1], 'misseng')).toBe(1);
	});
});

describe('sortKalenjinSearchResults', () => {
	it('prefers primary exact matches, then alternate spellings, then fuzzy a/o matches', () => {
		expect(sortKalenjinSearchResults(WORDS, 'kot').map((word) => word.id)).toEqual(['3', '1', '2']);
		expect(sortKalenjinSearchResults(WORDS, 'misseng').map((word) => word.id)).toEqual([
			'2',
			'1',
			'3'
		]);
		expect(sortKalenjinSearchResults(WORDS, 'chomchom').map((word) => word.id)).toEqual([
			'1',
			'2',
			'3'
		]);
	});
});
