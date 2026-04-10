import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import type { RequestHandler } from './$types';

type LinkTokenPayload = {
	tokenId?: string;
	wordId?: string;
};

function clean(value: unknown): string {
	return String(value ?? '').trim();
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

export const POST: RequestHandler = async ({ params, request }) => {
	const payload = (await request.json()) as LinkTokenPayload;
	const tokenId = clean(payload.tokenId);
	const wordId = clean(payload.wordId);

	if (!tokenId || !wordId) {
		return json({ error: 'Token and dictionary word are required.' }, { status: 400 });
	}

	const token = await ensureSentenceToken(params.id, tokenId);
	const word = await prisma.word.findUnique({
		where: { id: wordId },
		select: {
			id: true,
			kalenjin: true,
			translations: true,
			partOfSpeech: true,
			notes: true,
			createdAt: true,
			updatedAt: true
		}
	});

	if (!word) {
		error(404, 'Dictionary word not found.');
	}

	await prisma.exampleSentenceToken.update({
		where: { id: tokenId },
		data: { wordId }
	});

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

	return json({
		success: 'Token linked.',
		tokenId,
		linkedWord: word
	});
};
