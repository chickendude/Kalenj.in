import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [sentence, words] = await Promise.all([
		prisma.exampleSentence.findUnique({
			where: { id: params.id },
			include: {
				tokens: {
					orderBy: { tokenOrder: 'asc' },
					include: { word: true }
				}
			}
		}),
		prisma.word.findMany({
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: 500
		})
	]);

	if (!sentence) {
		error(404, 'Sentence not found');
	}

	return {
		sentence,
		words
	};
};
