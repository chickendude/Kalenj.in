import { describe, expect, it } from 'vitest';
import { normalizeWordSearchQuery, sortWordSearchResults } from './word-search';

function makeWord(overrides: Partial<{
	id: string;
	kalenjin: string;
	kalenjinNormalized: string;
	translations: string;
	pluralForm: string | null;
	pluralFormNormalized: string | null;
	spellings: Array<{ spelling: string; spellingNormalized: string }>;
}>) {
	return {
		id: overrides.id ?? '1',
		kalenjin: overrides.kalenjin ?? 'word',
		kalenjinNormalized: overrides.kalenjinNormalized ?? overrides.kalenjin ?? 'word',
		translations: overrides.translations ?? 'meaning',
		partOfSpeech: null,
		notes: null,
		pluralForm: overrides.pluralForm ?? null,
		pluralFormNormalized: overrides.pluralFormNormalized ?? null,
		presentAnee: null,
		presentInyee: null,
		presentInee: null,
		presentEchek: null,
		presentOkwek: null,
		presentIchek: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		spellings: overrides.spellings ?? []
	};
}

const WORDS = [
	makeWord({ id: '1', kalenjin: 'boiboenjin', translations: 'enjoy' }),
	makeWord({ id: '2', kalenjin: 'chamcham', translations: 'taste' })
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

describe('sortWordSearchResults – ranking scenarios', () => {
	it('ranks exact match above prefix match', () => {
		const words = [
			makeWord({ id: 'prefix', kalenjin: 'chamchamit' }),
			makeWord({ id: 'exact', kalenjin: 'chamcham' })
		];
		const sorted = sortWordSearchResults(words, 'chamcham');
		expect(sorted[0].id).toBe('exact');
	});

	it('ranks prefix match above contains match', () => {
		const words = [
			makeWord({ id: 'contains', kalenjin: 'kichamcham' }),
			makeWord({ id: 'prefix', kalenjin: 'chamchamit' })
		];
		const sorted = sortWordSearchResults(words, 'chamcham');
		expect(sorted[0].id).toBe('prefix');
	});

	it('ranks exact a/o match above a/o prefix match', () => {
		const words = [
			makeWord({ id: 'ao-prefix', kalenjin: 'chomchomit' }),
			makeWord({ id: 'ao-exact', kalenjin: 'chomchom' })
		];
		const sorted = sortWordSearchResults(words, 'chamcham');
		expect(sorted[0].id).toBe('ao-exact');
	});

	it('breaks ties alphabetically by kalenjin then by translations', () => {
		const words = [
			makeWord({ id: 'b', kalenjin: 'boi', translations: 'beta' }),
			makeWord({ id: 'a', kalenjin: 'boi', translations: 'alpha' })
		];
		const sorted = sortWordSearchResults(words, 'boi');
		expect(sorted.map((w) => w.id)).toEqual(['a', 'b']);
	});

	it('returns all words when query is empty (no filtering)', () => {
		const words = [
			makeWord({ id: 'z', kalenjin: 'zot' }),
			makeWord({ id: 'a', kalenjin: 'ait' })
		];
		// Empty query gives all Infinity scores — all words are returned
		const sorted = sortWordSearchResults(words, '');
		expect(sorted).toHaveLength(2);
	});

	it('matches alternative spellings and ranks them below primary exact match', () => {
		const words = [
			makeWord({
				id: 'spelling-match',
				kalenjin: 'missing',
				spellings: [{ spelling: 'misseng', spellingNormalized: 'misseng' }]
			}),
			makeWord({ id: 'exact-match', kalenjin: 'misseng' })
		];
		const sorted = sortWordSearchResults(words, 'misseng');
		expect(sorted[0].id).toBe('exact-match');
		expect(sorted[1].id).toBe('spelling-match');
	});
});
