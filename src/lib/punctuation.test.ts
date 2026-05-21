import { describe, expect, it } from 'vitest';
import { stripEdgePunctuation, STRIP_EDGE_PUNCTUATION } from './punctuation';

describe('stripEdgePunctuation', () => {
	it('removes ASCII punctuation from both ends', () => {
		expect(stripEdgePunctuation('"hello"')).toBe('hello');
		expect(stripEdgePunctuation('!hello?')).toBe('hello');
		expect(stripEdgePunctuation('(hello)')).toBe('hello');
	});

	it('preserves internal punctuation', () => {
		expect(stripEdgePunctuation("don't")).toBe("don't");
		expect(stripEdgePunctuation('co-op')).toBe('co-op');
		expect(stripEdgePunctuation('hello, world')).toBe('hello, world');
	});

	it('handles Unicode punctuation (curly quotes, em-dash)', () => {
		expect(stripEdgePunctuation('“hello”')).toBe('hello');
		expect(stripEdgePunctuation('—word—')).toBe('word');
	});

	it('returns an empty string when input is all punctuation', () => {
		expect(stripEdgePunctuation('!!!')).toBe('');
		expect(stripEdgePunctuation('...')).toBe('');
	});

	it('returns an empty string for an empty input', () => {
		expect(stripEdgePunctuation('')).toBe('');
	});

	it('keeps digits as edge characters', () => {
		expect(stripEdgePunctuation('1st')).toBe('1st');
		expect(stripEdgePunctuation('!4!')).toBe('4');
	});

	it('exports the regex used internally', () => {
		expect(STRIP_EDGE_PUNCTUATION.flags).toContain('g');
		expect(STRIP_EDGE_PUNCTUATION.flags).toContain('u');
	});
});
