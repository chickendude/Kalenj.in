import { describe, expect, it } from 'vitest';
import { normalizeWordSearchQuery, sortWordSearchResults } from './word-search';

const WORDS = [
	{
		id: '1',
		kalenjin: 'boiboenjin',
		kalenjinNormalized: 'boiboenjin',
		translations: 'enjoy',
		partOfSpeech: null,
		notes: null,
		pluralForm: null,
		pluralFormNormalized: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z')
	},
	{
		id: '2',
		kalenjin: 'chamcham',
		kalenjinNormalized: 'chamcham',
		translations: 'taste',
		partOfSpeech: null,
		notes: null,
		pluralForm: null,
		pluralFormNormalized: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z')
	}
];

describe('word-search compatibility wrapper', () => {
	it('normalizes punctuation the same way as the shared helper', () => {
		expect(normalizeWordSearchQuery("koito?!")).toBe('koito');
		expect(normalizeWordSearchQuery("k'alyet,")).toBe("k'alyet");
	});

	it('delegates ranking to the shared Kalenjin search helper', () => {
		expect(sortWordSearchResults(WORDS, 'chomchom').map((word) => word.id)).toEqual(['2', '1']);
	});
});
