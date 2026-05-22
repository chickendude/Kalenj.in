import { describe, expect, it } from 'vitest';
import {
	activeSegmentIndex,
	computeSplitParts,
	normalizeSearchQuery,
	partIndexForChar,
	serializeSpellings,
	stripSurroundingPunctuation
} from './token-annotations';

describe('normalizeSearchQuery', () => {
	it('drops sentence punctuation, collapses whitespace, lowercases', () => {
		expect(normalizeSearchQuery('  Chamgei,  world! ')).toBe('chamgei world');
		expect(normalizeSearchQuery('A.B?C')).toBe('a b c');
	});

	it('returns empty string for punctuation/whitespace only', () => {
		expect(normalizeSearchQuery('  . , ! ? ')).toBe('');
	});
});

describe('stripSurroundingPunctuation', () => {
	it('removes leading and trailing punctuation but keeps internal', () => {
		expect(stripSurroundingPunctuation('"hello"')).toBe('hello');
		expect(stripSurroundingPunctuation('(co-op),')).toBe('co-op');
		expect(stripSurroundingPunctuation("'don't'")).toBe("don't");
	});

	it('keeps combining marks and digits', () => {
		expect(stripSurroundingPunctuation('!2nd!')).toBe('2nd');
	});
});

describe('serializeSpellings', () => {
	it('joins spelling rows with commas', () => {
		expect(serializeSpellings([{ spelling: 'a' }, { spelling: 'b' }])).toBe('a, b');
	});

	it('returns empty string for null/undefined/empty', () => {
		expect(serializeSpellings(null)).toBe('');
		expect(serializeSpellings(undefined)).toBe('');
		expect(serializeSpellings([])).toBe('');
	});
});

describe('computeSplitParts', () => {
	it('slices text into contiguous parts at the split offsets', () => {
		expect(computeSplitParts('abcdef', [2, 4])).toEqual([
			{ text: 'ab', start: 0, end: 2 },
			{ text: 'cd', start: 2, end: 4 },
			{ text: 'ef', start: 4, end: 6 }
		]);
	});

	it('returns the whole string as one part when there are no splits', () => {
		expect(computeSplitParts('abc', [])).toEqual([{ text: 'abc', start: 0, end: 3 }]);
	});

	it('drops zero-width parts from duplicate or boundary offsets', () => {
		expect(computeSplitParts('abc', [0, 3])).toEqual([{ text: 'abc', start: 0, end: 3 }]);
	});
});

describe('partIndexForChar', () => {
	it('returns the part a character index falls into', () => {
		// splits at 2 and 4 -> parts [0,2)=0, [2,4)=1, [4,..)=2
		expect(partIndexForChar(0, [2, 4])).toBe(0);
		expect(partIndexForChar(1, [2, 4])).toBe(0);
		expect(partIndexForChar(2, [2, 4])).toBe(1);
		expect(partIndexForChar(4, [2, 4])).toBe(2);
	});

	it('is part 0 when there are no splits', () => {
		expect(partIndexForChar(5, [])).toBe(0);
	});
});

describe('activeSegmentIndex', () => {
	const token = { segments: [{ id: 's0' }, { id: 's1' }, { id: 's2' }] };

	it('finds the index of the segment within the token', () => {
		expect(activeSegmentIndex(token, { id: 's1' })).toBe(1);
	});

	it('returns -1 for null token or segment, or a missing segment', () => {
		expect(activeSegmentIndex(null, { id: 's1' })).toBe(-1);
		expect(activeSegmentIndex(token, null)).toBe(-1);
		expect(activeSegmentIndex(token, { id: 'nope' })).toBe(-1);
		expect(activeSegmentIndex({ segments: null }, { id: 's1' })).toBe(-1);
	});
});
