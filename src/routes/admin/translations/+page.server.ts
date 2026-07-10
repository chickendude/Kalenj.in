import { dev } from '$app/environment';
import { fail } from '@sveltejs/kit';
import { requireEditor } from '$lib/server/guards';
import { en, type MessageKey } from '$lib/i18n/messages/en';
import { kln } from '$lib/i18n/messages/kln';
import { writeKlnCatalog } from '$lib/server/kln-catalog-file';
import type { Actions, PageServerLoad } from './$types';

// Translations live in src/lib/i18n/messages/kln.ts and ship with the code.
// Saving rewrites that file, which is only possible against a running source
// tree — so editing works in development and the page is read-only in
// production. In dev, Vite reloads the changed module, so the next load()
// sees the fresh catalog.

export const load: PageServerLoad = ({ locals }) => {
	requireEditor(locals);
	return { translations: kln, canEdit: dev };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		requireEditor(locals);
		if (!dev) {
			return fail(403, {
				error:
					'Translations are part of the code and can only be edited on a development ' +
					'server. Run the site locally, save your changes there, and commit them.'
			});
		}

		const data = await request.formData();
		const key = String(data.get('key') ?? '') as MessageKey;
		const value = String(data.get('value') ?? '').trim();

		if (!(key in en)) {
			return fail(400, { error: `Unknown message key "${key}".` });
		}

		const next = { ...kln };
		if (!value) {
			delete next[key];
			await writeKlnCatalog(next);
			return { cleared: key };
		}

		next[key] = value;
		await writeKlnCatalog(next);
		return { saved: key };
	}
};
