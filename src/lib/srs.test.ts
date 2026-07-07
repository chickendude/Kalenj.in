import { describe, expect, it } from 'vitest';
import {
	AGAIN_RETRY_MINUTES,
	EASE_MAX,
	EASE_MIN,
	gradeCard,
	intervalFuzzFactor,
	suggestedGradeFromRecall,
	type SrsState
} from './srs';

const NOW = new Date('2026-07-07T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const freshCard: SrsState = { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 };
const matureCard: SrsState = { ease: 2.5, intervalDays: 10, reps: 5, lapses: 1 };

describe('gradeCard', () => {
	it('AGAIN resets reps, bumps lapses, and re-queues in ~10 minutes', () => {
		const next = gradeCard(matureCard, 'AGAIN', NOW);
		expect(next.reps).toBe(0);
		expect(next.lapses).toBe(2);
		expect(next.intervalDays).toBe(0);
		expect(next.ease).toBeCloseTo(2.3);
		expect(next.dueAt.getTime()).toBe(NOW.getTime() + AGAIN_RETRY_MINUTES * 60 * 1000);
	});

	it('ease never drops below the floor', () => {
		const next = gradeCard({ ...matureCard, ease: EASE_MIN }, 'AGAIN', NOW);
		expect(next.ease).toBe(EASE_MIN);
	});

	it('GOOD progresses a new card to 1 day, then 3 days, then ease-multiplied', () => {
		const first = gradeCard(freshCard, 'GOOD', NOW);
		expect(first.intervalDays).toBe(1);
		expect(first.reps).toBe(1);
		expect(first.dueAt.getTime()).toBe(NOW.getTime() + DAY_MS);

		const second = gradeCard(first, 'GOOD', NOW);
		expect(second.intervalDays).toBe(3);

		const third = gradeCard(second, 'GOOD', NOW);
		expect(third.intervalDays).toBeCloseTo(3 * 2.5);
	});

	it('GOOD leaves ease unchanged', () => {
		const next = gradeCard(matureCard, 'GOOD', NOW);
		expect(next.ease).toBe(matureCard.ease);
	});

	it('HARD reduces ease and grows the interval slowly', () => {
		const next = gradeCard(matureCard, 'HARD', NOW);
		expect(next.ease).toBeCloseTo(2.35);
		expect(next.intervalDays).toBeCloseTo(12);
		expect(next.reps).toBe(6);
	});

	it('HARD on a new card schedules at least 1 day', () => {
		const next = gradeCard(freshCard, 'HARD', NOW);
		expect(next.intervalDays).toBe(1);
	});

	it('EASY raises ease (capped) and jumps the interval', () => {
		const next = gradeCard(matureCard, 'EASY', NOW);
		expect(next.ease).toBeCloseTo(2.65);
		expect(next.intervalDays).toBeCloseTo(10 * 2.5 * 1.3);

		const capped = gradeCard({ ...matureCard, ease: EASE_MAX }, 'EASY', NOW);
		expect(capped.ease).toBe(EASE_MAX);
	});

	it('EASY on a new card schedules at least 2 days', () => {
		const next = gradeCard(freshCard, 'EASY', NOW);
		expect(next.intervalDays).toBe(2);
	});

	it('applies deterministic fuzz when a card id is provided', () => {
		const a = gradeCard(matureCard, 'GOOD', NOW, 'card-a');
		const again = gradeCard(matureCard, 'GOOD', NOW, 'card-a');
		expect(a.intervalDays).toBe(again.intervalDays);
		expect(a.intervalDays).toBeGreaterThanOrEqual(10 * 2.5 * 0.9);
		expect(a.intervalDays).toBeLessThanOrEqual(10 * 2.5 * 1.1);
	});
});

describe('intervalFuzzFactor', () => {
	it('stays within ±10% and is deterministic', () => {
		for (const id of ['a', 'b', 'clw123', 'cuid-like-value']) {
			const factor = intervalFuzzFactor(id);
			expect(factor).toBeGreaterThanOrEqual(0.9);
			expect(factor).toBeLessThanOrEqual(1.1);
			expect(intervalFuzzFactor(id)).toBe(factor);
		}
	});
});

describe('suggestedGradeFromRecall', () => {
	it('suggests GOOD for a clean first-try answer', () => {
		expect(
			suggestedGradeFromRecall({ correct: true, usedHint: false, wrongSubmits: 0, revealed: false })
		).toBe('GOOD');
	});

	it('suggests HARD when a hint or extra attempt was needed', () => {
		expect(
			suggestedGradeFromRecall({ correct: true, usedHint: true, wrongSubmits: 0, revealed: false })
		).toBe('HARD');
		expect(
			suggestedGradeFromRecall({ correct: true, usedHint: false, wrongSubmits: 2, revealed: false })
		).toBe('HARD');
	});

	it('suggests AGAIN when revealed or wrong', () => {
		expect(
			suggestedGradeFromRecall({ correct: false, usedHint: false, wrongSubmits: 1, revealed: false })
		).toBe('AGAIN');
		expect(
			suggestedGradeFromRecall({ correct: true, usedHint: false, wrongSubmits: 0, revealed: true })
		).toBe('AGAIN');
	});
});
