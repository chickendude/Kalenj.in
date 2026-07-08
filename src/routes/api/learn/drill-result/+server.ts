import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { recordDrillMiss } from '$lib/server/learning';
import type { RequestHandler } from './$types';

type Payload = {
	lessonWordId?: unknown;
	correct?: unknown;
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	const payload = (await request.json().catch(() => ({}))) as Payload;

	const lessonWordId = typeof payload.lessonWordId === 'string' ? payload.lessonWordId.trim() : '';
	if (!lessonWordId) error(400, 'Missing lesson word.');
	if (typeof payload.correct !== 'boolean') error(400, 'Invalid result.');

	// Correct answers don't advance the schedule from inside a lesson; only
	// misses touch the SRS state.
	if (!payload.correct) {
		await recordDrillMiss(user.id, lessonWordId);
	}
	return json({ ok: true });
};
