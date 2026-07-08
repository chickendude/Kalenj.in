import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { completeLesson } from '$lib/server/learning';
import type { RequestHandler } from './$types';

type Payload = {
	lessonId?: unknown;
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	const payload = (await request.json().catch(() => ({}))) as Payload;

	const lessonId = typeof payload.lessonId === 'string' ? payload.lessonId.trim() : '';
	if (!lessonId) error(400, 'Missing lesson.');

	const result = await completeLesson(user.id, lessonId);
	return json(result);
};
