import { getDueCards } from '$lib/server/learning';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Signed out: cards are null — the client builds the queue from its
	// locally stored SRS state and hydrates content via /api/learn/card-content.
	if (!locals.user) return { cards: null };
	const cards = await getDueCards(locals.user.id);
	return { cards };
};
