import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function readInitialTheme(): Theme {
	if (!browser) return 'light';
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'light' || stored === 'dark') return stored;
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readDomTheme(): Theme {
	if (!browser) return 'light';
	return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export const theme = writable<Theme>(browser ? readDomTheme() : 'light');

export function initTheme(): void {
	if (!browser) return;
	const next = readInitialTheme();
	applyTheme(next);
}

export function setTheme(next: Theme): void {
	if (!browser) return;
	applyTheme(next);
	localStorage.setItem(STORAGE_KEY, next);
}

export function toggleTheme(): void {
	if (!browser) return;
	const next = readDomTheme() === 'dark' ? 'light' : 'dark';
	setTheme(next);
}

function applyTheme(next: Theme): void {
	document.documentElement.dataset.theme = next;
	theme.set(next);
}
