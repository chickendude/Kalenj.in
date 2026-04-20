import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';

const ALLOWED_FIELDS = ['kalenjin', 'translations'] as const;
type WordInlineField = (typeof ALLOWED_FIELDS)[number];

export const POST: RequestHandler = async ({ request, params, locals }) => {
	requireEditor(locals);
	const body = (await request.json()) as { field?: string; value?: string };
	const { field, value } = body;

	if (!field || value === undefined) {
		error(400, 'field and value are required.');
	}

	if (!(ALLOWED_FIELDS as readonly string[]).includes(field)) {
		error(400, 'Invalid field.');
	}

	const word = await prisma.word.findUnique({ where: { id: params.id } });
	if (!word) {
		error(404, 'Word not found.');
	}

	const typedField = field as WordInlineField;

	const updated = await prisma.word.update({
		where: { id: params.id },
		data: { [typedField]: value }
	});

	return json({ ok: true, word: { id: updated.id, kalenjin: updated.kalenjin, translations: updated.translations } });
};
