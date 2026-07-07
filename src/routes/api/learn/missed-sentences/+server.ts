import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { setSentenceMissed } from '$lib/server/learning';
import { prisma } from '$lib/server/prisma';
import type { RequestHandler } from './$types';

type Payload = {
	sentenceId?: unknown;
	missed?: unknown;
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	const payload = (await request.json().catch(() => ({}))) as Payload;

	const sentenceId = typeof payload.sentenceId === 'string' ? payload.sentenceId.trim() : '';
	const missed = payload.missed;

	if (!sentenceId) error(400, 'Missing sentence.');
	if (typeof missed !== 'boolean') error(400, 'Invalid missed flag.');

	if (missed) {
		const exists = await prisma.exampleSentence.findUnique({
			where: { id: sentenceId },
			select: { id: true }
		});
		if (!exists) error(404, 'Sentence not found.');
	}

	await setSentenceMissed(user.id, sentenceId, missed);
	return json({ ok: true });
};
