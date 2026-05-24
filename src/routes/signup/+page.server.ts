import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { hashPassword } from '$lib/server/password';
import { sendVerificationEmail } from '$lib/server/verification';
import type { Actions, PageServerLoad } from './$types';

const MIN_PASSWORD_LENGTH = 12;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{2,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
	default: async ({ request, url }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '').trim();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const displayName = String(data.get('displayName') ?? '').trim() || null;
		const password = String(data.get('password') ?? '');
		const confirmPassword = String(data.get('confirmPassword') ?? '');

		const formEcho = { username, email, displayName: displayName ?? '' };

		if (!USERNAME_RE.test(username)) {
			return fail(400, {
				...formEcho,
				error: 'Username must be 2–40 characters: letters, digits, _ . -'
			});
		}
		if (!EMAIL_RE.test(email)) {
			return fail(400, { ...formEcho, error: 'Enter a valid email address.' });
		}
		if (password.length < MIN_PASSWORD_LENGTH) {
			return fail(400, {
				...formEcho,
				error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
			});
		}
		if (password !== confirmPassword) {
			return fail(400, { ...formEcho, error: 'Password and confirmation do not match.' });
		}

		const existingUsername = await prisma.user.findUnique({ where: { username } });
		if (existingUsername) {
			return fail(400, { ...formEcho, error: 'Username already taken.' });
		}
		const existingEmail = await prisma.user.findUnique({ where: { email } });
		if (existingEmail) {
			return fail(400, { ...formEcho, error: 'An account with that email already exists.' });
		}

		const passwordHash = await hashPassword(password);
		const user = await prisma.user.create({
			data: { username, email, displayName, role: 'USER', passwordHash }
		});

		await sendVerificationEmail(
			{ id: user.id, email, displayName: user.displayName, username: user.username },
			url.origin
		);

		throw redirect(303, `/verify-email/sent?email=${encodeURIComponent(email)}`);
	}
};
