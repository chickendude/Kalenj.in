import { describe, expect, it } from 'vitest';
import {
	firstTranslation,
	isNumericTranslationSearchQuery,
	parseTranslationList,
	scoreTranslationMatch,
	sortTranslationSearchResults
} from './translations';

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

describe('isNumericTranslationSearchQuery', () => {
	it('detects digit-only searches even with surrounding spaces', () => {
		expect(isNumericTranslationSearchQuery(' 10 ')).toBe(true);
		expect(isNumericTranslationSearchQuery('ten')).toBe(false);
	});
});

describe('scoreTranslationMatch', () => {
	it('prefers exact numeric matches inside parentheses', () => {
		expect(scoreTranslationMatch('one (1)', '1')).toBe(0);
		expect(scoreTranslationMatch('ten (10)', '1')).toBeGreaterThan(
			scoreTranslationMatch('one (1)', '1')
		);
	});

	it('prefers numeric matches in parentheses over plain-text numeric mentions', () => {
		expect(scoreTranslationMatch('one (1)', '1')).toBeLessThan(
			scoreTranslationMatch('level 1 learner', '1')
		);
	});

	it('still ranks exact textual translation matches above broader matches', () => {
		expect(scoreTranslationMatch('taste', 'taste')).toBeLessThan(
			scoreTranslationMatch('taste good', 'taste')
		);
	});
});

describe('sortTranslationSearchResults', () => {
	it('shows exact numeric matches before broader numeric matches', () => {
		const words = [
			{ id: 'ten', kalenjin: 'taman', translations: 'ten (10)' },
			{ id: 'one', kalenjin: 'agenge', translations: 'one (1)' },
			{ id: 'plain', kalenjin: 'bo', translations: 'level 1 learner' }
		];

		expect(sortTranslationSearchResults(words, '1').map((word) => word.id)).toEqual([
			'one',
			'ten',
			'plain'
		]);
	});

	it('keeps alphabetical tie-breaking for equally ranked results', () => {
		const words = [
			{ id: 'b', kalenjin: 'bor', translations: 'ten (10)' },
			{ id: 'a', kalenjin: 'agenge', translations: 'twelve (12)' }
		];

		expect(sortTranslationSearchResults(words, '1').map((word) => word.id)).toEqual(['a', 'b']);
	});
});
