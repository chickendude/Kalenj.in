import { error, json } from '@sveltejs/kit';
import { getCardContent, type CardContentRef } from '$lib/server/learning';
import type { RequestHandler } from './$types';

const MAX_CARDS = 100;

type Payload = {
	cards?: unknown;
};

function asId(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Hydrates review-card content for signed-out learners whose SRS state lives
 * in localStorage. Public data only (published lessons + dictionary words),
 * so no auth.
 */
export const POST: RequestHandler = async ({ request }) => {
	const payload = (await request.json().catch(() => ({}))) as Payload;
	if (!Array.isArray(payload.cards)) error(400, 'Missing cards.');
	if (payload.cards.length > MAX_CARDS) error(400, `At most ${MAX_CARDS} cards per request.`);

	const refs: CardContentRef[] = payload.cards.map((entry) => {
		const card = (entry ?? {}) as Record<string, unknown>;
		return {
			wordId: asId(card.wordId),
			standaloneLessonWordId: asId(card.standaloneLessonWordId),
			contextLessonWordId: asId(card.contextLessonWordId)
		};
	});

	const cards = await getCardContent(refs);
	return json({ cards });
};
