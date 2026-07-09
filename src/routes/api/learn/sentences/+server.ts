import { error, json } from '@sveltejs/kit';
import { getSentencesByIds } from '$lib/server/learning';
import type { RequestHandler } from './$types';

const MAX_SENTENCES = 200;

type Payload = {
	sentenceIds?: unknown;
};

/**
 * Audio-backed sentences by id, for listening practice over a signed-out
 * learner's locally stored missed sentences. Corpus sentences are public, so
 * no auth.
 */
export const POST: RequestHandler = async ({ request }) => {
	const payload = (await request.json().catch(() => ({}))) as Payload;
	if (!Array.isArray(payload.sentenceIds)) error(400, 'Missing sentences.');
	if (payload.sentenceIds.length > MAX_SENTENCES) {
		error(400, `At most ${MAX_SENTENCES} sentences per request.`);
	}

	const sentenceIds = payload.sentenceIds
		.filter((id): id is string => typeof id === 'string')
		.map((id) => id.trim())
		.filter(Boolean);

	const sentences = await getSentencesByIds(sentenceIds);
	return json({ sentences });
};
