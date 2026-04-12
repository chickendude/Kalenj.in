import { describe, expect, it } from 'vitest';
import { normalizeWordSearchQuery, sortWordSearchResults } from './word-search';

const WORDS = [
	{ id: '1', kalenjin: 'boiboenjin', translations: 'enjoy' },
	{ id: '2', kalenjin: 'missing', translations: 'greet, good evening' },
	{ id: '3', kalenjin: 'mursik', translations: 'sour milk' },
	{ id: '4', kalenjin: 'mindilil', translations: 'sour' }
];

describe('sortWordSearchResults', () => {
	it('removes sentence punctuation but keeps apostrophes in search queries', () => {
		expect(normalizeWordSearchQuery("koito?!")).toBe('koito');
		expect(normalizeWordSearchQuery("k'alyet,")).toBe("k'alyet");
	});

	it('prioritizes exact lemma matches', () => {
		expect(sortWordSearchResults(WORDS, 'mursik').map((word) => word.id)).toEqual([
			'3',
			'1',
			'4',
			'2'
		]);
	});

	it('prioritizes prefix lemma matches before translation matches', () => {
		expect(sortWordSearchResults(WORDS, 'mi').map((word) => word.id)).toEqual([
			'4',
			'2',
			'3',
			'1'
		]);
	});

	it('prioritizes exact translation entries after lemma matches', () => {
		expect(sortWordSearchResults(WORDS, 'sour').map((word) => word.id)).toEqual([
			'4',
			'3',
			'1',
			'2'
		]);
	});
});
