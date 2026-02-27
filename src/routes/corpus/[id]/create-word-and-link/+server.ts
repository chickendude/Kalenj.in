import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { normalizeLemma } from '$lib/server/normalize-lemma';
import type { RequestHandler } from './$types';

type CreateWordPayload = {
	tokenId?: string;
	kalenjin?: string;
	translations?: string;
	notes?: string;
};

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

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

export const POST: RequestHandler = async ({ params, request }) => {
	const payload = (await request.json()) as CreateWordPayload;

	const tokenId = clean(payload.tokenId);
	const kalenjin = clean(payload.kalenjin);
	const translations = clean(payload.translations);
	const notes = clean(payload.notes);

	if (!tokenId || !kalenjin || !translations) {
		return json(
			{ error: 'Token, Kalenjin lemma, and translations are required.' },
			{ status: 400 }
		);
	}

	const token = await ensureSentenceToken(params.id, tokenId);
	const kalenjinNormalized = normalizeLemma(kalenjin);

	const word = await prisma.word.create({
		data: {
			kalenjin,
			kalenjinNormalized,
			translations,
			notes: notes || null
		},
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

	return json({
		success: 'Created dictionary word and linked token.',
		tokenId,
		createdWord: word
	});
};
