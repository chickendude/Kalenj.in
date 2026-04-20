import type { Prisma } from '@prisma/client';
import { parseStoryImportText } from '$lib/story-import';
import { prisma } from '$lib/server/prisma';
import { syncStorySentenceTokens } from '$lib/server/sentence-annotations';

type TokenWithSegments = {
	wordId: string | null;
	segments: Array<{ wordId: string | null }>;
};

function collectLinkedWordIds(tokens: TokenWithSegments[]): string[] {
	const wordIds = new Set<string>();

	for (const token of tokens) {
		if (token.wordId) {
			wordIds.add(token.wordId);
		}

		for (const segment of token.segments) {
			if (segment.wordId) {
				wordIds.add(segment.wordId);
			}
		}
	}

	return [...wordIds];
}

async function loadStorySentenceForCorpus(
	tx: Prisma.TransactionClient,
	storySentenceId: string
) {
	return tx.storySentence.findUnique({
		where: { id: storySentenceId },
		select: {
			id: true,
			kalenjin: true,
			english: true,
			tokens: {
				orderBy: { tokenOrder: 'asc' },
				select: {
					tokenOrder: true,
					surfaceForm: true,
					normalizedForm: true,
					wordId: true,
					inContextTranslation: true,
					segments: {
						orderBy: { segmentOrder: 'asc' },
						select: {
							segmentOrder: true,
							segmentStart: true,
							segmentEnd: true,
							surfaceForm: true,
							normalizedForm: true,
							wordId: true
						}
					}
				}
			}
		}
	});
}

export async function syncStorySentenceToCorpus(
	tx: Prisma.TransactionClient,
	storySentenceId: string
): Promise<void> {
	let storySentence = await loadStorySentenceForCorpus(tx, storySentenceId);

	if (!storySentence) {
		return;
	}

	if (storySentence.kalenjin.trim().length > 0 && storySentence.tokens.length === 0) {
		await syncStorySentenceTokens(tx, storySentence.id, storySentence.kalenjin);
		storySentence = await loadStorySentenceForCorpus(tx, storySentenceId);
	}

	if (!storySentence) {
		return;
	}

	const corpusSentence = await tx.exampleSentence.upsert({
		where: { storySentenceId: storySentence.id },
		update: {
			kalenjin: storySentence.kalenjin,
			english: storySentence.english
		},
		create: {
			storySentenceId: storySentence.id,
			kalenjin: storySentence.kalenjin,
			english: storySentence.english
		},
		select: { id: true }
	});

	await tx.wordSentence.deleteMany({
		where: { exampleSentenceId: corpusSentence.id }
	});

	await tx.exampleSentenceToken.deleteMany({
		where: { exampleSentenceId: corpusSentence.id }
	});

	for (const token of storySentence.tokens) {
		await tx.exampleSentenceToken.create({
			data: {
				exampleSentenceId: corpusSentence.id,
				tokenOrder: token.tokenOrder,
				surfaceForm: token.surfaceForm,
				normalizedForm: token.normalizedForm,
				wordId: token.wordId,
				inContextTranslation: token.inContextTranslation,
				...(token.segments.length > 0
					? {
							segments: {
								createMany: {
									data: token.segments.map((segment) => ({
										segmentOrder: segment.segmentOrder,
										segmentStart: segment.segmentStart,
										segmentEnd: segment.segmentEnd,
										surfaceForm: segment.surfaceForm,
										normalizedForm: segment.normalizedForm,
										wordId: segment.wordId
									}))
								}
							}
						}
					: {})
			}
		});
	}

	const linkedWordIds = collectLinkedWordIds(storySentence.tokens);
	if (linkedWordIds.length > 0) {
		await tx.wordSentence.createMany({
			data: linkedWordIds.map((wordId) => ({
				wordId,
				exampleSentenceId: corpusSentence.id
			}))
		});
	}
}

export async function backfillMissingStoryCorpusEntries(storyId?: string): Promise<void> {
	const missingSentences = await prisma.storySentence.findMany({
		where: {
			...(storyId ? { storyId } : {}),
			OR: [
				{ corpusSentence: { is: null } },
				{ corpusSentence: { is: { tokens: { none: {} } } } }
			]
		},
		select: { id: true },
		orderBy: [{ storyId: 'asc' }, { sentenceOrder: 'asc' }]
	});

	if (missingSentences.length === 0) {
		return;
	}

	await prisma.$transaction(async (tx) => {
		for (const sentence of missingSentences) {
			await syncStorySentenceToCorpus(tx, sentence.id);
		}
	});
}

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
		await syncStorySentenceToCorpus(tx, createdSentence.id);
	}
}
