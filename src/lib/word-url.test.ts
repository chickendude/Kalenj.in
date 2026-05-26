import { describe, expect, it } from 'vitest';
import {
	decodeDictionarySegment,
	dictionaryEntryHref,
	slugifyWordName
} from './word-url';

describe('word URL helpers', () => {
	it('falls back to the word id when no stored slug is present', () => {
		expect(dictionaryEntryHref({ id: 'abc123', kalenjin: 'Chamgei!' })).toBe(
			'/dictionary/abc123'
		);
	});

	it('uses stored slugs when present', () => {
		expect(dictionaryEntryHref({ id: 'abc123', kalenjin: 'kot', slug: 'kot-2' })).toBe(
			'/dictionary/kot-2'
		);
	});

	it('falls back for names without slug characters', () => {
		expect(slugifyWordName('!!!')).toBe('word');
	});

	it('decodes dictionary route segments', () => {
		expect(decodeDictionarySegment('Chamgei%20Nebo')).toBe('chamgei nebo');
	});

	it('leaves malformed percent escapes on the normal lookup path', () => {
		expect(decodeDictionarySegment('%')).toBe('%');
	});
});
