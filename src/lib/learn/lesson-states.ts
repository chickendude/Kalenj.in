/**
 * Lesson unlock-state computation shared by the server dashboard and the
 * local, signed-out progress store. Client-safe — no $lib/server imports.
 */

export type LessonState = 'locked' | 'available' | 'in_progress' | 'completed';

/**
 * Compute per-lesson unlock states for one level's published lessons, in
 * lessonOrder. A lesson is unlocked when it is the first published lesson of
 * the level or the previous published lesson is completed.
 */
export function lessonStates(
	lessons: Array<{ id: string }>,
	progressByLesson: Map<string, { status: string; lastStepIndex: number }>
): Map<string, LessonState> {
	const states = new Map<string, LessonState>();
	let previousCompleted = true;
	for (const lesson of lessons) {
		const progress = progressByLesson.get(lesson.id);
		if (progress?.status === 'COMPLETED') {
			states.set(lesson.id, 'completed');
			previousCompleted = true;
		} else if (previousCompleted) {
			states.set(lesson.id, progress ? 'in_progress' : 'available');
			previousCompleted = false;
		} else {
			states.set(lesson.id, 'locked');
			previousCompleted = false;
		}
	}
	return states;
}
