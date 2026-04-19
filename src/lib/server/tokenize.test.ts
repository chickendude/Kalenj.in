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
	it('returns no tokens for empty or whitespace-only input', () => {
		expect(tokenizeSentence('')).toEqual([]);
		expect(tokenizeSentence('   \t\n  ')).toEqual([]);
	});

	it('tokenizes each word with order and normalized values', () => {
		expect(tokenizeSentence('Kalenjin ng\'olyot')).toEqual([
			{
				tokenOrder: 0,
				surfaceForm: 'Kalenjin',
				normalizedForm: 'kalenjin'
			},
			{
				tokenOrder: 1,
				surfaceForm: "ng'olyot",
				normalizedForm: "ng'olyot"
			}
		]);
	});

	it('filters out tokens that normalize to an empty string', () => {
		expect(tokenizeSentence('hello ... world')).toEqual([
			{
				tokenOrder: 0,
				surfaceForm: 'hello',
				normalizedForm: 'hello'
			},
			{
				tokenOrder: 2,
				surfaceForm: 'world',
				normalizedForm: 'world'
			}
		]);
	});

	it('handles repeated whitespace without changing word order indexes', () => {
		expect(tokenizeSentence('  one   two\tthree  ')).toEqual([
			{
				tokenOrder: 0,
				surfaceForm: 'one',
				normalizedForm: 'one'
			},
			{
				tokenOrder: 1,
				surfaceForm: 'two',
				normalizedForm: 'two'
			},
			{
				tokenOrder: 2,
				surfaceForm: 'three',
				normalizedForm: 'three'
			}
		]);
	});
});
