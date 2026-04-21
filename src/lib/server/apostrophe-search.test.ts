import { describe, expect, it } from 'vitest';
import { buildApostropheOptionalRegexSource } from './apostrophe-search';

function matches(query: string, value: string): boolean {
	return new RegExp(`^${buildApostropheOptionalRegexSource(query)}$`, 'u').test(value);
}

describe('buildApostropheOptionalRegexSource', () => {
	it('allows apostrophes in values when the query omits them', () => {
		expect(matches('koita', 'koita')).toBe(true);
		expect(matches('koita', "koit'a")).toBe(true);
		expect(matches('koita', 'koit\u2019a')).toBe(true);
	});

	it('requires apostrophes in values when the query includes them', () => {
		expect(matches("koit'a", "koit'a")).toBe(true);
		expect(matches("koit'a", 'koit\u2019a')).toBe(true);
		expect(matches("koit'a", 'koita')).toBe(false);
	});
});
