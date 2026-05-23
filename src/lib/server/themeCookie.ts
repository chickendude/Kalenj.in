import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';

export const THEME_PREF_COOKIE = 'theme_pref';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type ThemePreference = 'light' | 'dark' | 'auto';

export function parseThemePreference(value: string | null | undefined): ThemePreference | null {
	if (value === 'light' || value === 'dark' || value === 'auto') return value;
	return null;
}

export function setThemePreferenceCookie(cookies: Cookies, pref: ThemePreference): void {
	cookies.set(THEME_PREF_COOKIE, pref, {
		path: '/',
		httpOnly: false,
		secure: !dev,
		sameSite: 'lax',
		maxAge: ONE_YEAR_SECONDS
	});
}

export function clearThemePreferenceCookie(cookies: Cookies): void {
	cookies.delete(THEME_PREF_COOKIE, { path: '/' });
}
