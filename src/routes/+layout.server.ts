import { parseEditModeCookie } from '$lib/stores/editMode.svelte';
import { getUiTranslationOverrides } from '$lib/server/ui-translations';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	return {
		user: locals.user,
		editMode: parseEditModeCookie(cookies.get('editMode')),
		locale: locals.locale,
		i18nOverrides: await getUiTranslationOverrides('kln')
	};
};
