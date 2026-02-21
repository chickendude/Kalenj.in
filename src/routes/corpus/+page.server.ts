import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { tokenizeSentence } from '$lib/server/tokenize';
import type { Actions, PageServerLoad } from './$types';

function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

export const load: PageServerLoad = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();

	const sentences = await prisma.exampleSentence.findMany({
		where: query
			? {
					OR: [
						{ kalenjin: { contains: query, mode: 'insensitive' } },
						{ english: { contains: query, mode: 'insensitive' } }
					]
				}
			: undefined,
		orderBy: { createdAt: 'desc' },
		include: {
			tokens: {
				orderBy: { tokenOrder: 'asc' },
				include: { word: true }
			},
			_count: { select: { tokens: true } }
		},
		take: 100
	});

	return {
		query,
		sentences
	};
};

export const actions: Actions = {
	createSentence: async ({ request }) => {
		const formData = await request.formData();
		const kalenjin = readText(formData, 'kalenjin');
		const english = readText(formData, 'english');
		const source = readText(formData, 'source');

		if (!kalenjin || !english) {
			return fail(400, {
				error: 'Kalenjin sentence and English translation are required.',
				values: { kalenjin, english, source }
			});
		}

		const tokenData = tokenizeSentence(kalenjin);
		if (tokenData.length === 0) {
			return fail(400, {
				error: 'Could not extract tokens from this sentence.',
				values: { kalenjin, english, source }
			});
		}

		const sentence = await prisma.exampleSentence.create({
			data: {
				kalenjin,
				english,
				source: source || null,
				tokens: {
					createMany: {
						data: tokenData
					}
				}
			}
		});

		redirect(303, `/corpus/${sentence.id}`);
	}
};
