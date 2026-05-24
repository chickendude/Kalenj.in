import { redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { consumeVerificationToken } from '$lib/server/verification';
import { createSession, setSessionCookie } from '$lib/server/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const token = url.searchParams.get('token') ?? '';
	const result = await consumeVerificationToken(token);
	if (!result.ok) {
		return { status: 'failed' as const, reason: result.reason };
	}

	const user = await prisma.user.findUnique({ where: { id: result.userId } });
	if (!user) {
		return { status: 'failed' as const, reason: 'invalid' as const };
	}

	if (!user.emailVerifiedAt) {
		await prisma.user.update({
			where: { id: user.id },
			data: { emailVerifiedAt: new Date() }
		});
	}

	const session = await createSession(user.id);
	setSessionCookie(cookies, session.id, session.expiresAt);
	throw redirect(303, '/');
};
