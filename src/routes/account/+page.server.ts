import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { hashPassword, verifyPassword } from '$lib/server/password';
import { invalidateOtherUserSessions } from '$lib/server/session';
import { requireEditor } from '$lib/server/guards';
import type { Actions, PageServerLoad } from './$types';

const MIN_PASSWORD_LENGTH = 12;

export const load: PageServerLoad = ({ locals }) => {
	const user = requireEditor(locals);
	return { user };
};

export const actions: Actions = {
	changePassword: async ({ request, locals }) => {
		const user = requireEditor(locals);
		const data = await request.formData();
		const currentPassword = String(data.get('currentPassword') ?? '');
		const newPassword = String(data.get('newPassword') ?? '');
		const confirmPassword = String(data.get('confirmPassword') ?? '');

		if (!currentPassword || !newPassword || !confirmPassword) {
			return fail(400, { error: 'All fields are required.' });
		}
		if (newPassword.length < MIN_PASSWORD_LENGTH) {
			return fail(400, { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
		}
		if (newPassword !== confirmPassword) {
			return fail(400, { error: 'New password and confirmation do not match.' });
		}

		const fresh = await prisma.user.findUnique({ where: { id: user.id } });
		if (!fresh) return fail(400, { error: 'Account not found.' });

		const ok = await verifyPassword(fresh.passwordHash, currentPassword);
		if (!ok) return fail(400, { error: 'Current password is incorrect.' });

		if (await verifyPassword(fresh.passwordHash, newPassword)) {
			return fail(400, { error: 'New password must be different from current password.' });
		}

		const newHash = await hashPassword(newPassword);
		await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

		if (locals.sessionToken) {
			await invalidateOtherUserSessions(user.id, locals.sessionToken);
		}

		return { success: 'Password updated. Other sessions have been signed out.' };
	}
};
