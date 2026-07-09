/**
 * Daily listening-program arithmetic shared by the server and the local,
 * signed-out progress store. Client-safe — no $lib/server imports.
 */

export const PROGRAM_PATTERN_MAX_DAYS = 10;
export const PROGRAM_PATTERN_MAX_REPS = 20;

/** Parse "6 4 3 2" into [6, 4, 3, 2]; null when invalid. */
export function parseProgramPattern(raw: string): number[] | null {
	const parts = raw.trim().split(/[\s,]+/).filter(Boolean);
	if (parts.length === 0 || parts.length > PROGRAM_PATTERN_MAX_DAYS) return null;
	const reps = parts.map((part) => Number.parseInt(part, 10));
	if (reps.some((n) => !Number.isFinite(n) || n < 1 || n > PROGRAM_PATTERN_MAX_REPS)) return null;
	return reps;
}

export type ProgramDayEntry = {
	lessonId: string;
	/** 1-based day-of-age: 1 on the day the lesson joins the program. */
	age: number;
	reps: number;
};

/**
 * Which lessons are active today and at how many reps. Lesson at position N
 * (1-based) joins on day N and stays active for pattern.length days.
 */
export function programDayPlan(
	lessonIds: string[],
	currentDay: number,
	pattern: number[]
): { active: ProgramDayEntry[]; finished: boolean } {
	const active: ProgramDayEntry[] = [];
	for (let index = 0; index < lessonIds.length; index += 1) {
		const age = currentDay - index;
		if (age >= 1 && age <= pattern.length) {
			active.push({ lessonId: lessonIds[index], age, reps: pattern[age - 1] });
		}
	}
	const lastActiveDay = lessonIds.length === 0 ? 0 : lessonIds.length + pattern.length - 1;
	return { active, finished: currentDay > lastActiveDay };
}
