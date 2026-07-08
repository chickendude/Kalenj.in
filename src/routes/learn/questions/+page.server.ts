import { prisma } from '$lib/server/prisma';
import { requireUser } from '$lib/server/guards';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const questions = await prisma.clarificationRequest.findMany({
		where: { userId: user.id },
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
