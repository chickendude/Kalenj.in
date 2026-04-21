import { describe, expect, it, vi } from 'vitest';
import { pickWordOfTheDayIndex, startOfLocalDay, wordOfTheDayKey } from './word-of-the-day';

describe('word-of-the-day', () => {
	it('produces a stable key for the same Eastern calendar day', () => {
		const a = new Date('2026-04-20T11:00:00.000Z');
		const b = new Date('2026-04-21T03:59:59.000Z');
		expect(wordOfTheDayKey(a)).toBe(wordOfTheDayKey(b));
		expect(wordOfTheDayKey(a)).toBe(20260420);
	});

	it('changes at midnight Eastern time during daylight saving time', () => {
		const beforeMidnightEastern = new Date('2026-04-21T03:59:59.000Z');
		const afterMidnightEastern = new Date('2026-04-21T04:00:00.000Z');
		expect(wordOfTheDayKey(beforeMidnightEastern)).toBe(20260420);
		expect(wordOfTheDayKey(afterMidnightEastern)).toBe(20260421);
	});

	it('changes at midnight Eastern time during standard time', () => {
		const beforeMidnightEastern = new Date('2026-01-21T04:59:59.000Z');
		const afterMidnightEastern = new Date('2026-01-21T05:00:00.000Z');
		expect(wordOfTheDayKey(beforeMidnightEastern)).toBe(20260120);
		expect(wordOfTheDayKey(afterMidnightEastern)).toBe(20260121);
	});

	it('represents the Eastern day as UTC midnight for storage', () => {
		expect(startOfLocalDay(new Date('2026-04-21T03:59:59.000Z')).toISOString()).toBe(
			'2026-04-20T00:00:00.000Z'
		);
		expect(startOfLocalDay(new Date('2026-04-21T04:00:00.000Z')).toISOString()).toBe(
			'2026-04-21T00:00:00.000Z'
		);
	});

	it('preserves stored UTC-midnight dates without shifting them', () => {
		const storedDate = new Date('2026-04-21T00:00:00.000Z');
		expect(startOfLocalDay(storedDate)).toBe(storedDate);
		expect(wordOfTheDayKey(storedDate)).toBe(20260421);
	});

	it('uses Eastern time for the default current instant at UTC midnight', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-21T00:00:00.000Z'));

		try {
			expect(startOfLocalDay().toISOString()).toBe('2026-04-20T00:00:00.000Z');
			expect(wordOfTheDayKey()).toBe(20260420);
		} finally {
			vi.useRealTimers();
		}
	});

	it('indexes within the pool range', () => {
		expect(pickWordOfTheDayIndex(20260420, 7)).toBeGreaterThanOrEqual(0);
		expect(pickWordOfTheDayIndex(20260420, 7)).toBeLessThan(7);
	});

	it('returns 0 when the pool is empty', () => {
		expect(pickWordOfTheDayIndex(20260420, 0)).toBe(0);
	});
});
