import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { verifyPassword } from '$lib/server/password';
import { createSession, setSessionCookie } from '$lib/server/session';
import { parseThemePreference, setThemePreferenceCookie } from '$lib/server/themeCookie';
import type { Actions, PageServerLoad } from './$types';

function safeRedirect(target: string | null): string {
	if (!target) return '/';
	if (!target.startsWith('/') || target.startsWith('//')) return '/';
	return target;
}

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) {
		throw redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
	}
	return { redirectTo: url.searchParams.get('redirectTo') ?? '' };
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '').trim();
		const password = String(data.get('password') ?? '');
		const redirectTo = safeRedirect(
			String(data.get('redirectTo') ?? url.searchParams.get('redirectTo') ?? '')
		);

		if (!username || !password) {
			return fail(400, {
				username,
				email: '',
				needsVerification: false,
				error: 'Enter a username and password.'
			});
		}

		const user = await prisma.user.findUnique({ where: { username } });
		const ok = user ? await verifyPassword(user.passwordHash, password) : false;
		if (!user || !ok) {
			return fail(400, {
				username,
				email: '',
				needsVerification: false,
				error: 'Invalid credentials.'
			});
		}

		if (user.email && !user.emailVerifiedAt) {
			return fail(403, {
				username,
				email: user.email,
				needsVerification: true,
				error: 'Verify your email before signing in.'
			});
		}

		const session = await createSession(user.id);
		setSessionCookie(cookies, session.id, session.expiresAt);
		const pref = parseThemePreference(user.themePreference) ?? 'auto';
		setThemePreferenceCookie(cookies, pref);
		throw redirect(303, redirectTo);
	}
};
