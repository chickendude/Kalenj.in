import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';
export type ThemePreference = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'theme';
const COOKIE_KEY = 'theme_pref';

function readCookie(name: string): string | null {
	if (!browser || typeof document === 'undefined' || !document.cookie) return null;
	const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
	return match ? decodeURIComponent(match[1]) : null;
}

function validPreference(value: string | null): ThemePreference | null {
	return value === 'light' || value === 'dark' || value === 'auto' ? value : null;
}

function readStoredPreference(): ThemePreference {
	if (!browser) return 'auto';
	const cookie = validPreference(readCookie(COOKIE_KEY));
	if (cookie) return cookie;
	const stored = validPreference(localStorage.getItem(STORAGE_KEY));
	if (stored) return stored;
	return 'auto';
}

function readDomTheme(): Theme {
	if (!browser) return 'light';
	return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function systemTheme(): Theme {
	if (!browser) return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(pref: ThemePreference): Theme {
	return pref === 'auto' ? systemTheme() : pref;
}

export const theme = writable<Theme>(browser ? readDomTheme() : 'light');
export const themePreference = writable<ThemePreference>(
	browser ? readStoredPreference() : 'auto'
);

let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;

function detachSystemListener(): void {
	if (mediaQuery && mediaListener && typeof mediaQuery.removeEventListener === 'function') {
		mediaQuery.removeEventListener('change', mediaListener);
	}
	mediaQuery = null;
	mediaListener = null;
}

function attachSystemListener(): void {
	if (!browser) return;
	detachSystemListener();
	const mq = window.matchMedia('(prefers-color-scheme: dark)');
	if (typeof mq.addEventListener !== 'function') return;
	mediaQuery = mq;
	mediaListener = () => {
		if (readStoredPreference() === 'auto') applyTheme(systemTheme());
	};
	mq.addEventListener('change', mediaListener);
}

export function initTheme(): void {
	if (!browser) return;
	const pref = readStoredPreference();
	applyTheme(resolve(pref));
	themePreference.set(pref);
	if (pref === 'auto') attachSystemListener();
	else detachSystemListener();
}

export type PersistMode = 'local' | 'none';

export function setThemePreference(
	pref: ThemePreference,
	options?: { persist?: PersistMode }
): void {
	if (!browser) return;
	const persist = options?.persist ?? 'local';
	if (persist === 'local') localStorage.setItem(STORAGE_KEY, pref);
	themePreference.set(pref);
	applyTheme(resolve(pref));
	if (pref === 'auto') attachSystemListener();
	else detachSystemListener();
}

export function setTheme(next: Theme): void {
	setThemePreference(next);
}

export function toggleTheme(): void {
	if (!browser) return;
	const next = readDomTheme() === 'dark' ? 'light' : 'dark';
	setThemePreference(next);
}

function applyTheme(next: Theme): void {
	document.documentElement.dataset.theme = next;
	theme.set(next);
}
