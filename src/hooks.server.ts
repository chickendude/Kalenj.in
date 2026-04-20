import type { Handle } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	clearSessionCookie,
	setSessionCookie,
	validateSession
} from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE) ?? null;
	event.locals.user = null;
	event.locals.sessionToken = null;

	if (token) {
		const validated = await validateSession(token);
		if (validated) {
			event.locals.user = validated.user;
			event.locals.sessionToken = validated.session.id;
			if (validated.renewed) {
				setSessionCookie(event.cookies, validated.session.id, validated.session.expiresAt);
			}
		} else {
			clearSessionCookie(event.cookies);
		}
	}

	return resolve(event);
};
