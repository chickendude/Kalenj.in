/**
 * XP amounts and streak arithmetic shared by the server (Prisma-backed) and
 * the local, signed-out progress store. Client-safe — no $lib/server imports.
 */

export const LESSON_COMPLETE_XP = 20;
export const REVIEW_XP = 2;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC for "today" — learn activity uses UTC day boundaries. */
export function utcDayStart(now = new Date()): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Consecutive-day streak ending today (or yesterday, so the streak isn't
 * shown as broken before the learner has studied today).
 *
 * @param dayTimes activity days as UTC-midnight timestamps, descending.
 */
export function computeStreak(dayTimes: number[], now = new Date()): number {
	if (dayTimes.length === 0) return 0;

	const today = utcDayStart(now).getTime();
	let expected = today;
	if (dayTimes[0] !== today) {
		expected = today - DAY_MS;
		if (dayTimes[0] !== expected) return 0;
	}

	let streak = 0;
	for (const day of dayTimes) {
		if (day !== expected) break;
		streak += 1;
		expected -= DAY_MS;
	}
	return streak;
}
