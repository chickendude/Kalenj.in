import { prisma } from '$lib/server/prisma';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Questions need an account (answers are tied to the asker); signed-out
	// visitors get an empty list and a sign-up prompt.
	if (!locals.user) return { questions: [] };
	const questions = await prisma.clarificationRequest.findMany({
		where: { userId: locals.user.id },
		orderBy: { createdAt: 'desc' },
		take: 100,
		select: {
			id: true,
			targetType: true,
			question: true,
			status: true,
			answer: true,
			answeredAt: true,
			createdAt: true,
			word: { select: { id: true, kalenjin: true, translations: true } },
			sentence: { select: { id: true, kalenjin: true, english: true } },
			lesson: { select: { id: true, title: true } }
		}
	});
	return { questions };
};
