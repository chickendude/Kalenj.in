// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Locale } from '$lib/i18n/locale';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: {
				id: string;
				username: string;
				displayName: string | null;
				role: 'ADMIN' | 'MANAGER' | 'USER';
				themePreference: 'light' | 'dark' | 'auto';
				statsFilterPreference: string | null;
			} | null;
			sessionToken: string | null;
			locale: Locale;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
