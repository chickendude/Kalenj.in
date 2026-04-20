import { describe, expect, it } from 'vitest';
import { pickWordOfTheDayIndex, wordOfTheDayKey } from './word-of-the-day';

describe('word-of-the-day', () => {
	it('produces a stable key for the same calendar day', () => {
		const a = new Date(2026, 3, 20, 7, 0, 0);
		const b = new Date(2026, 3, 20, 23, 59, 0);
		expect(wordOfTheDayKey(a)).toBe(wordOfTheDayKey(b));
	});

	it('produces a different key on the next day', () => {
		const a = new Date(2026, 3, 20);
		const b = new Date(2026, 3, 21);
		expect(wordOfTheDayKey(a)).not.toBe(wordOfTheDayKey(b));
	});

	it('indexes within the pool range', () => {
		expect(pickWordOfTheDayIndex(20260420, 7)).toBeGreaterThanOrEqual(0);
		expect(pickWordOfTheDayIndex(20260420, 7)).toBeLessThan(7);
	});

	it('returns 0 when the pool is empty', () => {
		expect(pickWordOfTheDayIndex(20260420, 0)).toBe(0);
	});
});
