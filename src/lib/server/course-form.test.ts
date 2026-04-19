import { describe, expect, it } from 'vitest';
import { parseLineSeparatedEntries, parsePositiveInteger } from './course-form';

describe('parseLineSeparatedEntries', () => {
	it('returns one trimmed entry per non-empty line', () => {
		expect(parseLineSeparatedEntries('hello\n  to search  \nthank you')).toEqual([
			'hello',
			'to search',
			'thank you'
		]);
	});

	it('ignores blank lines and deduplicates repeated entries', () => {
		expect(parseLineSeparatedEntries('\nhello\n\nhello\n  \nthank you\n')).toEqual([
			'hello',
			'thank you'
		]);
	});

	it('returns an empty list for a fully empty string', () => {
		expect(parseLineSeparatedEntries('')).toEqual([]);
	});

	it('returns an empty list for whitespace-only lines', () => {
		expect(parseLineSeparatedEntries(' \n\t\n  \r\n')).toEqual([]);
	});
});

describe('parsePositiveInteger', () => {
	it('returns the parsed number when it is a positive integer', () => {
		expect(parsePositiveInteger('4')).toBe(4);
	});

	it('falls back for missing, invalid, or non-positive values', () => {
		expect(parsePositiveInteger(null)).toBe(1);
		expect(parsePositiveInteger('abc')).toBe(1);
		expect(parsePositiveInteger('0')).toBe(1);
	});
});
