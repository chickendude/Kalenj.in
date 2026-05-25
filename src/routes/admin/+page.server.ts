import { redirect } from '@sveltejs/kit';
import { DEFAULT_ADMIN_TAB } from '$lib/admin-tabs';
import { requireEditor } from '$lib/server/guards';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireEditor(locals);
	throw redirect(303, `${DEFAULT_ADMIN_TAB}${url.search}`);
};
