import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { sendVerificationEmail } from '$lib/server/verification';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) {
		throw redirect(303, '/');
	}
	return { email: url.searchParams.get('email') ?? '' };
};

export const actions: Actions = {
	resend: async ({ request, url }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		if (!email) {
			return fail(400, { error: 'Missing email address.', email });
		}

		const user = await prisma.user.findUnique({ where: { email } });
		// Always behave the same regardless of whether the email exists, to avoid leaking accounts.
		if (user && !user.emailVerifiedAt && user.email) {
			await sendVerificationEmail(
				{
					id: user.id,
					email: user.email,
					displayName: user.displayName,
					username: user.username
				},
				url.origin
			);
		}

		return { resent: true, email };
	}
};
