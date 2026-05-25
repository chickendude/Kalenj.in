import { parseEditModeCookie } from '$lib/stores/editMode.svelte';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, cookies }) => {
	return {
		user: locals.user,
		editMode: parseEditModeCookie(cookies.get('editMode'))
	};
};
