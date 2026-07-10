import type { Handle } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	clearSessionCookie,
	setSessionCookie,
	validateSession
} from '$lib/server/session';
import {
	THEME_PREF_COOKIE,
	clearThemePreferenceCookie,
	setThemePreferenceCookie
} from '$lib/server/themeCookie';
import { DEFAULT_LOCALE, LOCALE_COOKIE, parseLocale } from '$lib/i18n/locale';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE) ?? null;
	event.locals.user = null;
	event.locals.sessionToken = null;
	event.locals.locale = parseLocale(event.cookies.get(LOCALE_COOKIE)) ?? DEFAULT_LOCALE;

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
			clearThemePreferenceCookie(event.cookies);
		}
	}

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale)
	});
};
