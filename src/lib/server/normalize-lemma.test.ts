import { describe, expect, it } from 'vitest';
import { normalizeLemma } from './normalize-lemma';

describe('normalizeLemma', () => {
	it('lowercases and trims surrounding punctuation', () => {
		expect(normalizeLemma(' "Kalenjin!" ')).toBe('kalenjin');
	});

	it('collapses repeated whitespace between words', () => {
		expect(normalizeLemma('  cheptoo   kiptoo  ')).toBe('cheptoo kiptoo');
	});

	it('preserves internal punctuation while removing edge punctuation', () => {
		expect(normalizeLemma("...'koit'a?!")).toBe("koit'a");
	});

	it('returns an empty string when the input only contains punctuation', () => {
		expect(normalizeLemma('..."?!')).toBe('');
	});
});
