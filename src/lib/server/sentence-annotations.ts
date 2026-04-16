import type { Prisma } from '@prisma/client';
import { tokenizeSentence } from '$lib/server/tokenize';

export async function syncExampleSentenceTokens(
	tx: Prisma.TransactionClient,
	exampleSentenceId: string,
	sentenceText: string
): Promise<void> {
	const tokenData = tokenizeSentence(sentenceText);

	await tx.exampleSentenceToken.deleteMany({
		where: { exampleSentenceId }
	});

	if (tokenData.length === 0) {
		return;
	}

	await tx.exampleSentenceToken.createMany({
		data: tokenData.map((token) => ({
			exampleSentenceId,
			tokenOrder: token.tokenOrder,
			surfaceForm: token.surfaceForm,
			normalizedForm: token.normalizedForm
		}))
	});
}

export async function syncStorySentenceTokens(
	tx: Prisma.TransactionClient,
	storySentenceId: string,
	sentenceText: string
): Promise<void> {
	const tokenData = tokenizeSentence(sentenceText);

	await tx.storySentenceToken.deleteMany({
		where: { storySentenceId }
	});

	if (tokenData.length === 0) {
		return;
	}

	await tx.storySentenceToken.createMany({
		data: tokenData.map((token) => ({
			storySentenceId,
			tokenOrder: token.tokenOrder,
			surfaceForm: token.surfaceForm,
			normalizedForm: token.normalizedForm
		}))
	});
}
