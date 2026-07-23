import { activityEntryActions, loadActivityEntries } from '$lib/server/activity-entries';
import { requireAdmin } from '$lib/server/guards';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	requireAdmin(locals);
	return loadActivityEntries(params.userId, url, true);
};

export const actions = activityEntryActions;
