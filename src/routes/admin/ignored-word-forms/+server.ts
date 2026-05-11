import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import { normalizeToken } from '$lib/server/tokenize';
import type { RequestHandler } from './$types';

const NOTE_MAX = 200;

type Payload = {
	surfaceForm?: string;
	normalizedForm?: string;
	note?: string | null;
};

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

function resolveNormalizedForm(payload: Payload): string {
	const explicit = clean(payload.normalizedForm);
	if (explicit) return normalizeToken(explicit);
	return normalizeToken(clean(payload.surfaceForm));
}

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const payload = (await request.json().catch(() => ({}))) as Payload;

	const normalizedForm = resolveNormalizedForm(payload);
	if (!normalizedForm) {
		return json({ error: 'A word is required.' }, { status: 400 });
	}

	const note = clean(payload.note) || null;
	if (note && note.length > NOTE_MAX) {
		return json({ error: `Note must be ${NOTE_MAX} characters or fewer.` }, { status: 400 });
	}

	const entry = await prisma.ignoredWordForm.upsert({
		where: { normalizedForm },
		update: { note },
		create: { normalizedForm, note },
		select: { normalizedForm: true, note: true, createdAt: true }
	});

	return json({ ignoredForm: entry });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);
	const payload = (await request.json().catch(() => ({}))) as Payload;
	const normalizedForm = resolveNormalizedForm(payload);
	if (!normalizedForm) {
		return json({ error: 'A word is required.' }, { status: 400 });
	}

	await prisma.ignoredWordForm.deleteMany({ where: { normalizedForm } });
	return json({ normalizedForm });
};
