import { requireUser } from '$lib/server/guards';
import { getPlayableLesson } from '$lib/server/learning';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = requireUser(locals);
	return getPlayableLesson(params.lessonId, user.id);
};
