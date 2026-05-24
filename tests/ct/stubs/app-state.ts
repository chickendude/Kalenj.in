// Test double for SvelteKit's `$app/state`. Route-level component tests do not
// run inside the SvelteKit router, so expose the small page shape they read.

export const page = {
	url: new URL('http://localhost/dictionary'),
	data: {
		user: {
			id: 'u1',
			username: 'editor',
			displayName: null,
			role: 'ADMIN',
			themePreference: 'auto'
		}
	}
};

export const navigating = null;
