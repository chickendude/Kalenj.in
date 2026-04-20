import { describe, it, expect } from 'vitest';
import { parseTranslationTerms, suggestCefrTargets } from './cefr-suggestions';

describe('parseTranslationTerms', () => {
	it('splits by semicolon', () => {
		expect(parseTranslationTerms('hello; world')).toEqual(['hello', 'world']);
	});

	it('keeps commas inside a term', () => {
		expect(parseTranslationTerms('hello, world')).toEqual(['hello, world']);
	});

	it('handles a single term', () => {
		expect(parseTranslationTerms('hello')).toEqual(['hello']);
	});

	it('removes parenthetical content', () => {
		expect(parseTranslationTerms('hi (informal)')).toEqual(['hi']);
	});

	it('removes parenthetical content from each semicolon-separated term', () => {
		expect(parseTranslationTerms('hi (informal); goodbye (farewell); run')).toEqual([
			'hi',
			'goodbye',
			'run'
		]);
	});

	it('removes nested parenthetical content', () => {
		expect(parseTranslationTerms('hello (greeting (casual)); world')).toEqual(['hello', 'world']);
	});

	it('filters term that becomes empty after removing parentheticals', () => {
		expect(parseTranslationTerms('(something); hello')).toEqual(['hello']);
	});

	it('trims surrounding whitespace', () => {
		expect(parseTranslationTerms('  hello ;  world  ')).toEqual(['hello', 'world']);
	});

	it('normalizes whitespace left behind by parentheticals', () => {
		expect(parseTranslationTerms('look (carefully) up;  good   morning')).toEqual([
			'look up',
			'good morning'
		]);
	});

	it('lowercases terms', () => {
		expect(parseTranslationTerms('Hello; WORLD')).toEqual(['hello', 'world']);
	});

	it('handles double semicolons (filters empty strings)', () => {
		expect(parseTranslationTerms('hello;;world')).toEqual(['hello', 'world']);
	});

	it('returns empty array for empty input', () => {
		expect(parseTranslationTerms('')).toEqual([]);
	});
});

describe('suggestCefrTargets', () => {
	const makeTarget = (id: string, english: string, coveredByLessonWordId: string | null = null) => ({
		id,
		english,
		coveredByLessonWordId
	});

	it('returns matching uncovered targets', () => {
		const targets = [makeTarget('1', 'hello'), makeTarget('2', 'world')];
		const result = suggestCefrTargets('hello', targets, new Set());
		expect(result).toEqual([makeTarget('1', 'hello')]);
	});

	it('matches multiple semicolon-separated terms', () => {
		const targets = [makeTarget('1', 'hello'), makeTarget('2', 'world'), makeTarget('3', 'foo')];
		const result = suggestCefrTargets('hello; world', targets, new Set());
		expect(result).toHaveLength(2);
		expect(result.map((t) => t.id)).toContain('1');
		expect(result.map((t) => t.id)).toContain('2');
	});

	it('excludes targets covered by another word (coveredByLessonWordId is set to a different word)', () => {
		const targets = [makeTarget('1', 'hello', 'other-word-id')];
		const result = suggestCefrTargets('hello', targets, new Set());
		expect(result).toEqual([]);
	});

	it('excludes targets that are already covered by the current word in stale page data', () => {
		const targets = [makeTarget('1', 'hello', 'current-word-id')];
		const result = suggestCefrTargets('hello', targets, new Set());
		expect(result).toEqual([]);
	});

	it('excludes targets already in coveredTargetIds set', () => {
		const targets = [makeTarget('1', 'hello')];
		const result = suggestCefrTargets('hello', targets, new Set(['1']));
		expect(result).toEqual([]);
	});

	it('does case-insensitive match on translations', () => {
		const targets = [makeTarget('1', 'hello')];
		const result = suggestCefrTargets('HELLO', targets, new Set());
		expect(result).toEqual([makeTarget('1', 'hello')]);
	});

	it('does case-insensitive match on CEFR english field', () => {
		const targets = [makeTarget('1', 'Hello')];
		const result = suggestCefrTargets('hello', targets, new Set());
		expect(result).toEqual([makeTarget('1', 'Hello')]);
	});

	it('returns empty array for empty translations', () => {
		const targets = [makeTarget('1', 'hello')];
		const result = suggestCefrTargets('', targets, new Set());
		expect(result).toEqual([]);
	});

	it('strips parentheticals before matching', () => {
		const targets = [makeTarget('1', 'hello')];
		const result = suggestCefrTargets('hello (greeting)', targets, new Set());
		expect(result).toEqual([makeTarget('1', 'hello')]);
	});

	it('strips parentheticals from CEFR target text before matching', () => {
		const targets = [makeTarget('1', 'hello (greeting)')];
		const result = suggestCefrTargets('hello', targets, new Set());
		expect(result).toEqual([makeTarget('1', 'hello (greeting)')]);
	});
});
