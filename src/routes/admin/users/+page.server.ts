import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { hashPassword } from '$lib/server/password';
import { invalidateAllUserSessions } from '$lib/server/session';
import { requireAdmin } from '$lib/server/guards';
import type { Actions, PageServerLoad } from './$types';

const MIN_PASSWORD_LENGTH = 12;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{2,40}$/;

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const users = await prisma.user.findMany({
		orderBy: { createdAt: 'asc' },
		select: {
			id: true,
			username: true,
			displayName: true,
			role: true,
			createdAt: true
		}
	});
	return { users };
};

export const actions: Actions = {
	createUser: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const username = String(data.get('username') ?? '').trim();
		const displayName = String(data.get('displayName') ?? '').trim() || null;
		const role = String(data.get('role') ?? '');
		const password = String(data.get('password') ?? '');

		if (!USERNAME_RE.test(username)) {
			return fail(400, {
				createError: 'Username must be 2–40 chars: letters, digits, _ . -',
				createForm: { username, displayName, role }
			});
		}
		if (role !== 'ADMIN' && role !== 'MANAGER') {
			return fail(400, {
				createError: 'Choose a role.',
				createForm: { username, displayName, role }
			});
		}
		if (password.length < MIN_PASSWORD_LENGTH) {
			return fail(400, {
				createError: `Initial password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
				createForm: { username, displayName, role }
			});
		}

		const existing = await prisma.user.findUnique({ where: { username } });
		if (existing) {
			return fail(400, {
				createError: 'Username already taken.',
				createForm: { username, displayName, role }
			});
		}

		const passwordHash = await hashPassword(password);
		await prisma.user.create({
			data: { username, displayName, role, passwordHash }
		});

		return { createSuccess: `User “${username}” created.` };
	},

	resetPassword: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');
		const newPassword = String(data.get('newPassword') ?? '');

		if (!userId) return fail(400, { resetError: 'Missing user.' });
		if (newPassword.length < MIN_PASSWORD_LENGTH) {
			return fail(400, {
				resetError: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
				resetUserId: userId
			});
		}
		const target = await prisma.user.findUnique({ where: { id: userId } });
		if (!target) return fail(400, { resetError: 'User not found.' });

		const passwordHash = await hashPassword(newPassword);
		await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
		await invalidateAllUserSessions(userId);

		return { resetSuccess: `Password reset for “${target.username}”. All their sessions signed out.` };
	},

	deleteUser: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');

		if (!userId) return fail(400, { deleteError: 'Missing user.' });
		if (userId === admin.id) {
			return fail(400, { deleteError: 'You cannot delete your own account.' });
		}
		const target = await prisma.user.findUnique({ where: { id: userId } });
		if (!target) return fail(400, { deleteError: 'User not found.' });

		await prisma.user.delete({ where: { id: userId } });
		return { deleteSuccess: `User “${target.username}” deleted.` };
	}
};
