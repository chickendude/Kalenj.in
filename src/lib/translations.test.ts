import { describe, expect, it } from 'vitest';
import { firstTranslation, parseTranslationList } from './translations';

describe('parseTranslationList', () => {
	it('splits translations by semicolon', () => {
		expect(parseTranslationList('hello; world')).toEqual(['hello', 'world']);
	});

	it('keeps commas inside a translation', () => {
		expect(parseTranslationList('hello, world; goodbye')).toEqual(['hello, world', 'goodbye']);
	});

	it('trims and filters empty translations', () => {
		expect(parseTranslationList('  hello ; ; world ;  ')).toEqual(['hello', 'world']);
	});

	it('returns an empty list for empty input', () => {
		expect(parseTranslationList('')).toEqual([]);
	});
});

describe('firstTranslation', () => {
	it('returns the first non-empty semicolon-separated translation', () => {
		expect(firstTranslation(' ; hello ; world')).toBe('hello');
	});

	it('returns an empty string when no translation is present', () => {
		expect(firstTranslation(' ; ')).toBe('');
	});
});
