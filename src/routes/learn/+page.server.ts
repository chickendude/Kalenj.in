import { getLearnDashboard } from '$lib/server/learning';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Signed-out learners get the lesson catalogue; their progress lives in
	// localStorage and is overlaid client-side.
	return getLearnDashboard(locals.user?.id ?? null);
};
