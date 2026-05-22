import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';
import { deleteAudio } from '$lib/server/audio-storage';
import { clearAudioUrl, isTargetType, readPreviousAudioUrl } from '$lib/server/audio-targets';

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);

	const body = (await request.json().catch(() => null)) as {
		targetType?: unknown;
		targetId?: unknown;
	} | null;

	if (!body) error(400, 'Invalid request body.');
	if (typeof body.targetId !== 'string' || !body.targetId) error(400, 'Missing targetId.');
	if (!isTargetType(body.targetType)) error(400, 'Invalid targetType.');

	const { targetType, targetId } = body;

	const existing = await readPreviousAudioUrl(targetType, targetId);
	if (!existing.found) error(404, 'Target not found.');

	await clearAudioUrl(targetType, targetId);

	if (existing.previousUrl) {
		const prev = existing.previousUrl;
		await deleteAudio(prev).catch((err) => {
			console.warn('Failed to delete audio file', prev, err);
		});
	}

	return json({ ok: true });
};
