import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { normalizeLemma } from '$lib/server/normalize-lemma';
import { replaceObservedWordForm } from '$lib/server/observed-word-forms';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';

type CreateWordPayload = {
	tokenId?: string;
	kalenjin?: string;
	translations?: string;
	notes?: string;
};

async function ensureSentenceToken(sentenceId: string, tokenId: string) {
	const token = await prisma.exampleSentenceToken.findUnique({
		where: { id: tokenId },
		select: { id: true, exampleSentenceId: true, wordId: true, normalizedForm: true }
	});

	if (!token || token.exampleSentenceId !== sentenceId) {
		error(404, 'Token not found for this sentence.');
	}

	return token;
}

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	requireEditor(locals);
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

	const word = await prisma.$transaction(async (tx) => {
		const word = await tx.word.create({
			data: {
				kalenjin,
				kalenjinNormalized: normalizeLemma(kalenjin),
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

		const updatedToken = await tx.exampleSentenceToken.update({
			where: { id: tokenId },
			data: { wordId: word.id },
			select: { wordId: true, normalizedForm: true }
		});
		await replaceObservedWordForm(tx, token, updatedToken);

		await tx.wordSentence.upsert({
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

		return word;
	});

	return json({
		success: 'Created dictionary word and linked token.',
		tokenId,
		createdWord: word
	});
};
