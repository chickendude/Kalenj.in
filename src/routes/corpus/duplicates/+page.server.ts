import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	throw redirect(308, `/admin/duplicates${url.search}`);
};

function redirectToAdminDuplicates() {
	throw redirect(303, '/admin/duplicates');
}

export const actions: Actions = {
	deleteSentences: redirectToAdminDuplicates,
	mergeSentences: redirectToAdminDuplicates,
	toggleUnique: redirectToAdminDuplicates
};
