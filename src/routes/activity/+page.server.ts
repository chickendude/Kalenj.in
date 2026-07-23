import { activityEntryActions, loadActivityEntries } from '$lib/server/activity-entries';
import { requireEditor } from '$lib/server/guards';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const viewer = requireEditor(locals);
	return loadActivityEntries(viewer.id, url, viewer.role === 'ADMIN');
};

export const actions = activityEntryActions;
