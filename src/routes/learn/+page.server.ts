import { requireUser } from '$lib/server/guards';
import { getLearnDashboard } from '$lib/server/learning';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	return getLearnDashboard(user.id);
};
