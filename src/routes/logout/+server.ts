import { redirect } from '@sveltejs/kit';
import { clearSessionCookie, invalidateSession } from '$lib/server/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	if (locals.sessionToken) {
		await invalidateSession(locals.sessionToken);
	}
	clearSessionCookie(cookies);
	throw redirect(303, '/');
};
