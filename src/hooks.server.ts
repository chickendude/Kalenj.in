import type { Handle } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	clearSessionCookie,
	setSessionCookie,
	validateSession
} from '$lib/server/session';
import { THEME_PREF_COOKIE, setThemePreferenceCookie } from '$lib/server/themeCookie';

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
			const existing = event.cookies.get(THEME_PREF_COOKIE);
			if (existing !== validated.user.themePreference) {
				setThemePreferenceCookie(event.cookies, validated.user.themePreference);
			}
		} else {
			clearSessionCookie(event.cookies);
		}
	}

	return resolve(event);
};
