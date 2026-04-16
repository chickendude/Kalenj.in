import type { Prisma } from '@prisma/client';
import { parseStoryImportText } from '$lib/story-import';
import { syncStorySentenceTokens } from '$lib/server/sentence-annotations';

export async function syncStorySentences(
	tx: Prisma.TransactionClient,
	storyId: string,
	storyText: string | null
): Promise<void> {
	const sentences = storyText ? parseStoryImportText(storyText) : [];

	await tx.storySentence.deleteMany({
		where: { storyId }
	});

	if (sentences.length === 0) {
		return;
	}

	for (const sentence of sentences) {
		const createdSentence = await tx.storySentence.create({
			data: {
				storyId,
				sentenceOrder: sentence.sentenceOrder,
				speaker: sentence.speaker,
				kalenjin: sentence.kalenjin,
				english: sentence.english
			}
		});

		await syncStorySentenceTokens(tx, createdSentence.id, sentence.kalenjin);
	}
}
