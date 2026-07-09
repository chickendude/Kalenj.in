import { error, json } from '@sveltejs/kit';
import { getPlaylistSegments } from '$lib/server/learning';
import type { RequestHandler } from './$types';

const MAX_LESSONS = 100;

/**
 * Per-lesson listening segments (published lessons only), keyed by lessonId —
 * used to build a signed-out learner's daily-program session client-side.
 */
export const GET: RequestHandler = async ({ url }) => {
	const lessonIds = (url.searchParams.get('lessonIds') ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
	if (lessonIds.length === 0) error(400, 'Missing lessons.');
	if (lessonIds.length > MAX_LESSONS) error(400, `At most ${MAX_LESSONS} lessons per request.`);

	const segments = await getPlaylistSegments(lessonIds);
	return json({ segments });
};
