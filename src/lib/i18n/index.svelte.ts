import { browser } from '$app/environment';
import { getContext, setContext } from 'svelte';
import { LOCALE_COOKIE, type Locale } from './locale';
import { translate, translateWithSlot, type MessageParams } from './translate';
import type { MessageKey } from './messages/en';

const KEY = Symbol('i18n');

export type I18nCtx = {
	readonly locale: Locale;
	set: (next: Locale) => void;
	t: (key: MessageKey, params?: MessageParams) => string;
	/** `translateWithSlot` bound to the current locale — see translate.ts. */
	tSplit: (key: MessageKey, slot: string, params?: MessageParams) => string[];
};

function writeCookie(value: Locale): void {
	if (!browser || typeof document === 'undefined') return;
	const expires = new Date();
	expires.setFullYear(expires.getFullYear() + 1);
	document.cookie =
		`${LOCALE_COOKIE}=${value};` + `path=/;expires=${expires.toUTCString()};SameSite=Lax`;
}

/**
 * Create the per-request i18n context. Call this once at the top of
 * `+layout.svelte` so server and client renders share the same initial
 * locale (read from the `locale` cookie via the layout load).
 */
export function createI18n(initial: Locale): I18nCtx {
	let locale = $state(initial);

	const ctx: I18nCtx = {
		get locale() {
			return locale;
		},
		set(next: Locale) {
			locale = next;
			writeCookie(next);
			if (browser) document.documentElement.lang = next;
		},
		t(key, params) {
			return translate(locale, key, params);
		},
		tSplit(key, slot, params) {
			return translateWithSlot(locale, key, slot, params);
		}
	};

	setContext(KEY, ctx);
	return ctx;
}

export function getI18n(): I18nCtx {
	const ctx = getContext<I18nCtx | undefined>(KEY);
	if (!ctx) {
		throw new Error(
			'getI18n() called outside of an i18n context. Did you forget createI18n() in +layout.svelte?'
		);
	}
	return ctx;
}
