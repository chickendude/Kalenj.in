import { error, fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import type { Actions, PageServerLoad } from './$types';

function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

async function ensureSentenceToken(sentenceId: string, tokenId: string) {
	const token = await prisma.exampleSentenceToken.findUnique({
		where: { id: tokenId },
		select: { id: true, exampleSentenceId: true }
	});

	if (!token || token.exampleSentenceId !== sentenceId) {
		error(404, 'Token not found for this sentence.');
	}

	return token;
}

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

export const actions: Actions = {
	linkToken: async ({ request, params }) => {
		const formData = await request.formData();
		const tokenId = readText(formData, 'tokenId');
		const wordId = readText(formData, 'wordId');

		if (!tokenId || !wordId) {
			return fail(400, { error: 'Token and dictionary word are required.' });
		}

		await ensureSentenceToken(params.id, tokenId);

		const [token, word] = await Promise.all([
			prisma.exampleSentenceToken.update({
				where: { id: tokenId },
				data: { wordId },
				select: { exampleSentenceId: true }
			}),
			prisma.word.findUnique({ where: { id: wordId }, select: { id: true } })
		]);

		if (!word) {
			error(404, 'Dictionary word not found.');
		}

		await prisma.wordSentence.upsert({
			where: {
				wordId_exampleSentenceId: {
					wordId,
					exampleSentenceId: token.exampleSentenceId
				}
			},
			update: {},
			create: {
				wordId,
				exampleSentenceId: token.exampleSentenceId
			}
		});

		return { success: 'Token linked.' };
	},
	unlinkToken: async ({ request, params }) => {
		const formData = await request.formData();
		const tokenId = readText(formData, 'tokenId');
		if (!tokenId) {
			return fail(400, { error: 'Token is required.' });
		}

		await ensureSentenceToken(params.id, tokenId);

		await prisma.exampleSentenceToken.update({
			where: { id: tokenId },
			data: { wordId: null }
		});

		return { success: 'Token unlinked.' };
	},
	createWordAndLink: async ({ request, params }) => {
		const formData = await request.formData();
		const tokenId = readText(formData, 'tokenId');
		const kalenjin = readText(formData, 'kalenjin');
		const translations = readText(formData, 'translations');
		const notes = readText(formData, 'notes');

		if (!tokenId || !kalenjin || !translations) {
			return fail(400, {
				error: 'Token, Kalenjin lemma, and translations are required.'
			});
		}

		const token = await ensureSentenceToken(params.id, tokenId);

		const word = await prisma.word.create({
			data: {
				kalenjin,
				translations,
				notes: notes || null
			}
		});

		await prisma.exampleSentenceToken.update({
			where: { id: tokenId },
			data: { wordId: word.id }
		});

		await prisma.wordSentence.upsert({
			where: {
				wordId_exampleSentenceId: {
					wordId: word.id,
					exampleSentenceId: token.exampleSentenceId
				}
			},
			update: {},
			create: {
				wordId: word.id,
				exampleSentenceId: token.exampleSentenceId
			}
		});

		return { success: 'Created dictionary word and linked token.' };
	}
};
