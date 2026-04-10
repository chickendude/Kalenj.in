import { describe, expect, it } from 'vitest';
import { normalizeToken, tokenizeSentence } from './tokenize';

describe('normalizeToken', () => {
	it('strips edge punctuation and lowercases the token', () => {
		expect(normalizeToken('"Kalenjin!"')).toBe('kalenjin');
	});

	it('preserves internal punctuation while cleaning edges', () => {
		expect(normalizeToken("koit'a?")).toBe("koit'a");
	});

	it('returns an empty string for punctuation-only input', () => {
		expect(normalizeToken('...')).toBe('');
	});
});

describe('tokenizeSentence', () => {
	it('tokenizes each word with order and normalized values', () => {
		expect(tokenizeSentence('Kalenjin ng\'olyot')).toEqual([
			{
				tokenOrder: 0,
				wordIndex: 0,
				segmentStart: 0,
				segmentEnd: 8,
				surfaceForm: 'Kalenjin',
				normalizedForm: 'kalenjin'
			},
			{
				tokenOrder: 1,
				wordIndex: 1,
				segmentStart: 0,
				segmentEnd: 8,
				surfaceForm: "ng'olyot",
				normalizedForm: "ng'olyot"
			}
		]);
	});

	it('filters out tokens that normalize to an empty string', () => {
		expect(tokenizeSentence('hello ... world')).toEqual([
			{
				tokenOrder: 0,
				wordIndex: 0,
				segmentStart: 0,
				segmentEnd: 5,
				surfaceForm: 'hello',
				normalizedForm: 'hello'
			},
			{
				tokenOrder: 2,
				wordIndex: 2,
				segmentStart: 0,
				segmentEnd: 5,
				surfaceForm: 'world',
				normalizedForm: 'world'
			}
		]);
	});

	it('handles repeated whitespace without changing word order indexes', () => {
		expect(tokenizeSentence('  one   two\tthree  ')).toEqual([
			{
				tokenOrder: 0,
				wordIndex: 0,
				segmentStart: 0,
				segmentEnd: 3,
				surfaceForm: 'one',
				normalizedForm: 'one'
			},
			{
				tokenOrder: 1,
				wordIndex: 1,
				segmentStart: 0,
				segmentEnd: 3,
				surfaceForm: 'two',
				normalizedForm: 'two'
			},
			{
				tokenOrder: 2,
				wordIndex: 2,
				segmentStart: 0,
				segmentEnd: 5,
				surfaceForm: 'three',
				normalizedForm: 'three'
			}
		]);
	});
});
