import { redirect } from '@sveltejs/kit';
import { clearSessionCookie, invalidateSession } from '$lib/server/session';
import { clearThemePreferenceCookie } from '$lib/server/themeCookie';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	if (locals.sessionToken) {
		await invalidateSession(locals.sessionToken);
	}
	clearSessionCookie(cookies);
	clearThemePreferenceCookie(cookies);
	throw redirect(303, '/');
};
