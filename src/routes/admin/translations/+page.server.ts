import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import { en } from '$lib/i18n/messages/en';
import type { Actions, PageServerLoad } from './$types';

// The only editable locale today. English is the source catalog and is
// maintained in code (src/lib/i18n/messages/en.ts).
const EDITABLE_LOCALE = 'kln';

export const load: PageServerLoad = async ({ locals }) => {
	requireEditor(locals);
	const rows = await prisma.uiTranslation.findMany({
		where: { locale: EDITABLE_LOCALE },
		orderBy: { key: 'asc' },
		select: { key: true, value: true }
	});
	return { overrides: rows };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		requireEditor(locals);
		const data = await request.formData();
		const key = String(data.get('key') ?? '');
		const value = String(data.get('value') ?? '').trim();

		if (!(key in en)) {
			return fail(400, { error: `Unknown message key "${key}".` });
		}

		if (!value) {
			await prisma.uiTranslation.deleteMany({ where: { locale: EDITABLE_LOCALE, key } });
			return { cleared: key };
		}

		await prisma.uiTranslation.upsert({
			where: { locale_key: { locale: EDITABLE_LOCALE, key } },
			create: { locale: EDITABLE_LOCALE, key, value },
			update: { value }
		});
		return { saved: key };
	}
};
