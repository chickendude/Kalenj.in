import { requireUser } from '$lib/server/guards';
import { getDueCards } from '$lib/server/learning';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const cards = await getDueCards(user.id);
	return { cards };
};
