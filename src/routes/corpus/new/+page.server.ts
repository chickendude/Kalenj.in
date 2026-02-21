import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { tokenizeSentence } from '$lib/server/tokenize';
import type { Actions } from './$types';

function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

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
