import { describe, expect, it } from 'vitest';
import { NEW_CARDS_PER_SESSION } from '$lib/srs';
import { computeStreak, LESSON_COMPLETE_XP, REVIEW_XP } from './activity';
import { programDayPlan } from './listening-program';
import {
	applyDrillMiss,
	applyLessonComplete,
	applyLessonStep,
	applyReviewGrade,
	applySentenceMissed,
	dueLocalCards,
	emptyLocalData,
	localStreakOf,
	localTotalXpOf,
	missedSentenceIds
} from './local-progress';

const NOW = new Date('2026-07-09T12:00:00.000Z');

const LESSON = {
	id: 'lesson-1',
	sections: [
		{
			words: [
				{ id: 'lw-1', wordId: 'word-1' },
				{ id: 'lw-2', wordId: 'word-1' }, // same dictionary word twice — one card
				{ id: 'lw-3', wordId: null } // standalone lesson word
			]
		}
	]
};

describe('applyLessonComplete', () => {
	it('seeds one card per word (first introduction wins) and awards XP once', () => {
		const data = emptyLocalData();
		const first = applyLessonComplete(data, LESSON, NOW);
		expect(first).toEqual({ newCards: 2, xp: LESSON_COMPLETE_XP });
		expect(data.lessonProgress['lesson-1'].status).toBe('COMPLETED');
		expect(data.cards.map((card) => card.contextLessonWordId)).toEqual(['lw-1', 'lw-3']);
		expect(data.cards[1]).toMatchObject({ wordId: null, standaloneLessonWordId: 'lw-3' });

		const again = applyLessonComplete(data, LESSON, NOW);
		expect(again).toEqual({ newCards: 0, xp: 0 });
		expect(localTotalXpOf(data)).toBe(LESSON_COMPLETE_XP);
	});
});

describe('applyLessonStep', () => {
	it('records the step but never demotes a completed lesson', () => {
		const data = emptyLocalData();
		applyLessonStep(data, 'lesson-1', 4);
		expect(data.lessonProgress['lesson-1']).toMatchObject({
			status: 'IN_PROGRESS',
			lastStepIndex: 4
		});
		applyLessonComplete(data, LESSON, NOW);
		applyLessonStep(data, 'lesson-1', 2);
		expect(data.lessonProgress['lesson-1'].status).toBe('COMPLETED');
	});
});

describe('applyDrillMiss', () => {
	it('creates a due card for a new word', () => {
		const data = emptyLocalData();
		applyDrillMiss(data, { id: 'lw-9', wordId: 'word-9' }, NOW);
		expect(data.cards).toHaveLength(1);
		expect(data.cards[0]).toMatchObject({ wordId: 'word-9', dueAt: NOW.toISOString() });
	});

	it('marks an existing card AGAIN without advancing the schedule', () => {
		const data = emptyLocalData();
		applyLessonComplete(data, LESSON, NOW);
		const card = data.cards[0];
		card.reps = 3;
		card.intervalDays = 10;
		applyDrillMiss(data, { id: 'lw-1', wordId: 'word-1' }, NOW);
		expect(card.reps).toBe(0);
		expect(card.lapses).toBe(1);
		expect(new Date(card.dueAt).getTime()).toBeLessThanOrEqual(NOW.getTime() + 15 * 60 * 1000);
	});
});

describe('dueLocalCards', () => {
	it('caps never-reviewed cards per session but not scheduled reviews', () => {
		const data = emptyLocalData();
		for (let i = 0; i < NEW_CARDS_PER_SESSION + 10; i += 1) {
			applyDrillMiss(data, { id: `lw-${i}`, wordId: `word-${i}` }, NOW);
		}
		// Five previously reviewed cards, also due.
		for (let i = 0; i < 5; i += 1) {
			applyDrillMiss(data, { id: `lw-old-${i}`, wordId: `word-old-${i}` }, NOW);
			const card = data.cards.at(-1)!;
			card.lastReviewedAt = NOW.toISOString();
		}
		const due = dueLocalCards(data, new Date(NOW.getTime() + 60 * 60 * 1000));
		expect(due.filter((card) => card.lastReviewedAt === null)).toHaveLength(
			NEW_CARDS_PER_SESSION
		);
		expect(due.filter((card) => card.lastReviewedAt !== null)).toHaveLength(5);
	});
});

describe('applyReviewGrade', () => {
	it('advances the schedule and records review XP', () => {
		const data = emptyLocalData();
		applyDrillMiss(data, { id: 'lw-1', wordId: 'word-1' }, NOW);
		const ok = applyReviewGrade(data, data.cards[0].id, 'GOOD', NOW);
		expect(ok).toBe(true);
		expect(data.cards[0].reps).toBe(1);
		expect(data.cards[0].lastReviewedAt).toBe(NOW.toISOString());
		expect(new Date(data.cards[0].dueAt).getTime()).toBeGreaterThan(NOW.getTime());
		expect(localTotalXpOf(data)).toBe(REVIEW_XP);
		expect(applyReviewGrade(data, 'nope', 'GOOD', NOW)).toBe(false);
	});
});

describe('streaks', () => {
	it('counts consecutive UTC days, tolerating "not studied yet today"', () => {
		const data = emptyLocalData();
		data.activity = { '2026-07-08': 20, '2026-07-07': 2, '2026-07-06': 2 };
		expect(localStreakOf(data, NOW)).toBe(3);
		data.activity['2026-07-09'] = 2;
		expect(localStreakOf(data, NOW)).toBe(4);
	});

	it('is zero after a gap', () => {
		expect(computeStreak([Date.parse('2026-07-06T00:00:00Z')], NOW)).toBe(0);
		expect(computeStreak([], NOW)).toBe(0);
	});
});

describe('missed sentences', () => {
	it('orders by miss count, then oldest flag first, and clears on unflag', () => {
		const data = emptyLocalData();
		applySentenceMissed(data, 's-1', true, new Date('2026-07-01T00:00:00Z'));
		applySentenceMissed(data, 's-2', true, new Date('2026-07-02T00:00:00Z'));
		applySentenceMissed(data, 's-2', true, new Date('2026-07-03T00:00:00Z'));
		applySentenceMissed(data, 's-3', true, new Date('2026-07-04T00:00:00Z'));
		expect(missedSentenceIds(data)).toEqual(['s-2', 's-1', 's-3']);
		applySentenceMissed(data, 's-2', false, NOW);
		expect(missedSentenceIds(data)).toEqual(['s-1', 's-3']);
	});
});

describe('programDayPlan', () => {
	it('ages lessons through the pattern and reports the finish day', () => {
		const pattern = [6, 4, 3, 2];
		const day1 = programDayPlan(['a', 'b', 'c'], 1, pattern);
		expect(day1.active).toEqual([{ lessonId: 'a', age: 1, reps: 6 }]);
		expect(day1.finished).toBe(false);

		const day3 = programDayPlan(['a', 'b', 'c'], 3, pattern);
		expect(day3.active).toEqual([
			{ lessonId: 'a', age: 3, reps: 3 },
			{ lessonId: 'b', age: 2, reps: 4 },
			{ lessonId: 'c', age: 1, reps: 6 }
		]);

		// Last active day is lessons + pattern - 1 = 6.
		expect(programDayPlan(['a', 'b', 'c'], 6, pattern).finished).toBe(false);
		expect(programDayPlan(['a', 'b', 'c'], 7, pattern).active).toEqual([]);
		expect(programDayPlan(['a', 'b', 'c'], 7, pattern).finished).toBe(true);
	});
});
