import { getPlayableLesson } from '$lib/server/learning';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Signed out: progress comes back null and is read from localStorage
	// client-side. Lesson content is public (published lessons only).
	return getPlayableLesson(params.lessonId, locals.user?.id ?? null);
};
