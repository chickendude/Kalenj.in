import { browser } from '$app/environment';
import { getContext, setContext } from 'svelte';

const KEY = Symbol('editMode');
const COOKIE_NAME = 'editMode';

export type EditModeCtx = {
	readonly value: boolean;
	set: (next: boolean) => void;
	toggle: () => void;
};

function writeCookie(value: boolean): void {
	if (!browser || typeof document === 'undefined') return;
	const expires = new Date();
	expires.setFullYear(expires.getFullYear() + 1);
	document.cookie =
		`${COOKIE_NAME}=${value ? 'true' : 'false'};` +
		`path=/;expires=${expires.toUTCString()};SameSite=Lax`;
}

/**
 * Create the per-request edit-mode context. Call this once at the top of
 * `+layout.svelte` so server and client renders are isolated and share the
 * same initial value (read from the `editMode` cookie via the layout load).
 */
export function createEditMode(initial: boolean): EditModeCtx {
	let value = $state(initial);

	const ctx: EditModeCtx = {
		get value() {
			return value;
		},
		set(next: boolean) {
			value = next;
			writeCookie(next);
		},
		toggle() {
			this.set(!value);
		}
	};

	setContext(KEY, ctx);
	return ctx;
}

export function getEditMode(): EditModeCtx {
	const ctx = getContext<EditModeCtx | undefined>(KEY);
	if (!ctx) {
		throw new Error(
			'getEditMode() called outside of an editMode context. Did you forget createEditMode() in +layout.svelte?'
		);
	}
	return ctx;
}

/** Parse the cookie value the server sends; defaults to `true`. */
export function parseEditModeCookie(raw: string | null | undefined): boolean {
	if (raw === undefined || raw === null) return true;
	return raw !== 'false';
}
