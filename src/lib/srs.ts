import type { ReviewGrade } from '@prisma/client';

/**
 * SM-2-lite spaced repetition scheduling.
 *
 * State lives on SrsCard; `gradeCard` is pure so it can be unit tested and
 * reused by the review endpoint without touching the database.
 */

export type SrsState = {
	ease: number;
	intervalDays: number;
	reps: number;
	lapses: number;
};

export type SrsNextState = SrsState & {
	dueAt: Date;
};

export const EASE_MIN = 1.3;
export const EASE_MAX = 3.0;
export const AGAIN_RETRY_MINUTES = 10;
export const NEW_CARDS_PER_SESSION = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deterministic ±10% fuzz so cards seeded together don't stay clumped on the
 * same due date forever. Seeded by card id to keep scheduling reproducible.
 */
export function intervalFuzzFactor(cardId: string): number {
	let hash = 0;
	for (let i = 0; i < cardId.length; i += 1) {
		hash = (hash * 31 + cardId.charCodeAt(i)) | 0;
	}
	const unit = (hash >>> 0) / 0xffffffff;
	return 0.9 + unit * 0.2;
}

export function gradeCard(
	state: SrsState,
	grade: ReviewGrade,
	now: Date,
	cardId = ''
): SrsNextState {
	const clampEase = (value: number) => Math.min(EASE_MAX, Math.max(EASE_MIN, value));

	if (grade === 'AGAIN') {
		return {
			ease: clampEase(state.ease - 0.2),
			intervalDays: 0,
			reps: 0,
			lapses: state.lapses + 1,
			dueAt: new Date(now.getTime() + AGAIN_RETRY_MINUTES * 60 * 1000)
		};
	}

	let ease = state.ease;
	let intervalDays: number;

	if (grade === 'HARD') {
		ease = clampEase(state.ease - 0.15);
		intervalDays = Math.max(1, state.intervalDays * 1.2);
	} else if (grade === 'GOOD') {
		if (state.reps === 0) {
			intervalDays = 1;
		} else if (state.reps === 1) {
			intervalDays = 3;
		} else {
			intervalDays = state.intervalDays * state.ease;
		}
	} else {
		ease = clampEase(state.ease + 0.15);
		intervalDays = Math.max(2, state.intervalDays * state.ease * 1.3);
	}

	if (intervalDays >= 1 && cardId) {
		intervalDays *= intervalFuzzFactor(cardId);
	}
	intervalDays = Math.round(intervalDays * 100) / 100;

	return {
		ease,
		intervalDays,
		reps: state.reps + 1,
		lapses: state.lapses,
		dueAt: new Date(now.getTime() + intervalDays * DAY_MS)
	};
}

export type RecallResult = {
	correct: boolean;
	usedHint: boolean;
	wrongSubmits: number;
	revealed: boolean;
};

/**
 * Map a typed-recall outcome to a suggested grade. EASY is never suggested —
 * it is only ever chosen explicitly by the learner.
 */
export function suggestedGradeFromRecall(result: RecallResult): ReviewGrade {
	if (result.revealed || !result.correct) return 'AGAIN';
	if (result.usedHint || result.wrongSubmits > 0) return 'HARD';
	return 'GOOD';
}
