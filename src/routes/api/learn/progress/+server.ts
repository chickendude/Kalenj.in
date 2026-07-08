import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { upsertLessonStep } from '$lib/server/learning';
import type { RequestHandler } from './$types';

type Payload = {
	lessonId?: unknown;
	stepIndex?: unknown;
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	const payload = (await request.json().catch(() => ({}))) as Payload;

	const lessonId = typeof payload.lessonId === 'string' ? payload.lessonId.trim() : '';
	const stepIndex = typeof payload.stepIndex === 'number' ? Math.floor(payload.stepIndex) : NaN;

	if (!lessonId) error(400, 'Missing lesson.');
	if (!Number.isFinite(stepIndex) || stepIndex < 0 || stepIndex > 10_000) {
		error(400, 'Invalid step index.');
	}

	await upsertLessonStep(user.id, lessonId, stepIndex);
	return json({ ok: true });
};
