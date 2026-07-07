import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { advanceListeningProgram } from '$lib/server/learning';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals);
	const currentDay = await advanceListeningProgram(user.id);
	return json({ currentDay });
};
