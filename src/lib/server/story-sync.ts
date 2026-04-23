import type { Prisma } from '@prisma/client';
import { parseStoryImportText } from '$lib/story-import';
import { prisma } from '$lib/server/prisma';
import { syncStorySentenceTokens } from '$lib/server/sentence-annotations';
import { splitIntoSentences, splitSentenceText } from '$lib/story-split';
import { tokenizeSentence } from '$lib/server/tokenize';

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

export function canSplitStorySentence(kalenjin: string): boolean {
	return splitSentenceText(kalenjin).length > 1;
}

export async function splitStorySentence(
	tx: Prisma.TransactionClient,
	storySentenceId: string
): Promise<{ splitCount: number }> {
	const original = await tx.storySentence.findUnique({
		where: { id: storySentenceId },
		select: {
			id: true,
			storyId: true,
			sentenceOrder: true,
			speaker: true,
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

	if (!original) {
		throw new Error('Story sentence not found.');
	}

	const pieces = splitIntoSentences(original.kalenjin, original.english);

	if (pieces.length <= 1) {
		return { splitCount: 1 };
	}

	const pieceTokens = pieces.map((piece) => tokenizeSentence(piece.kalenjin));
	const totalNewTokens = pieceTokens.reduce((sum, list) => sum + list.length, 0);
	const canPreserve = totalNewTokens === original.tokens.length;

	// Two-pass shift: Postgres checks (storyId, sentenceOrder) per-row during
	// a single UPDATE, so incrementing contiguous orders fires a transient
	// duplicate. Park affected rows above the offset first, then bring them
	// down to their final positions.
	const SHIFT_OFFSET = 1_000_000;
	await tx.storySentence.updateMany({
		where: {
			storyId: original.storyId,
			sentenceOrder: { gt: original.sentenceOrder }
		},
		data: { sentenceOrder: { increment: SHIFT_OFFSET + pieces.length - 1 } }
	});
	await tx.storySentence.updateMany({
		where: {
			storyId: original.storyId,
			sentenceOrder: { gte: SHIFT_OFFSET }
		},
		data: { sentenceOrder: { decrement: SHIFT_OFFSET } }
	});

	await tx.storySentence.update({
		where: { id: original.id },
		data: { kalenjin: pieces[0].kalenjin, english: pieces[0].english }
	});

	await tx.storySentenceToken.deleteMany({ where: { storySentenceId: original.id } });

	const rowIds: string[] = [original.id];
	for (let i = 1; i < pieces.length; i++) {
		const created = await tx.storySentence.create({
			data: {
				storyId: original.storyId,
				sentenceOrder: original.sentenceOrder + i,
				speaker: original.speaker,
				kalenjin: pieces[i].kalenjin,
				english: pieces[i].english
			},
			select: { id: true }
		});
		rowIds.push(created.id);
	}

	if (canPreserve) {
		let cursor = 0;
		for (let i = 0; i < pieces.length; i++) {
			const rowId = rowIds[i];
			const newTokens = pieceTokens[i];
			for (let j = 0; j < newTokens.length; j++) {
				const origToken = original.tokens[cursor + j];
				const createdToken = await tx.storySentenceToken.create({
					data: {
						storySentenceId: rowId,
						tokenOrder: j,
						surfaceForm: newTokens[j].surfaceForm,
						normalizedForm: newTokens[j].normalizedForm,
						wordId: origToken.wordId,
						inContextTranslation: origToken.inContextTranslation
					},
					select: { id: true }
				});
				if (origToken.segments.length > 0) {
					await tx.storySentenceTokenSegment.createMany({
						data: origToken.segments.map((segment) => ({
							tokenId: createdToken.id,
							segmentOrder: segment.segmentOrder,
							segmentStart: segment.segmentStart,
							segmentEnd: segment.segmentEnd,
							surfaceForm: segment.surfaceForm,
							normalizedForm: segment.normalizedForm,
							wordId: segment.wordId
						}))
					});
				}
			}
			cursor += newTokens.length;
		}
	} else {
		for (let i = 0; i < pieces.length; i++) {
			await syncStorySentenceTokens(tx, rowIds[i], pieces[i].kalenjin);
		}
	}

	for (const rowId of rowIds) {
		await syncStorySentenceToCorpus(tx, rowId);
	}

	return { splitCount: pieces.length };
}

function joinMergedText(a: string, b: string): string {
	const left = a.trim();
	const right = b.trim();
	if (!left) return right;
	if (!right) return left;
	return `${left} ${right}`;
}

export async function mergeStorySentenceWithNext(
	tx: Prisma.TransactionClient,
	storySentenceId: string
): Promise<{ merged: boolean }> {
	const target = await tx.storySentence.findUnique({
		where: { id: storySentenceId },
		select: {
			id: true,
			storyId: true,
			sentenceOrder: true,
			kalenjin: true,
			english: true,
			tokens: { select: { id: true } }
		}
	});

	if (!target) {
		throw new Error('Story sentence not found.');
	}

	const next = await tx.storySentence.findFirst({
		where: {
			storyId: target.storyId,
			sentenceOrder: { gt: target.sentenceOrder }
		},
		orderBy: { sentenceOrder: 'asc' },
		select: {
			id: true,
			sentenceOrder: true,
			kalenjin: true,
			english: true,
			tokens: { select: { id: true } }
		}
	});

	if (!next) {
		return { merged: false };
	}

	const mergedKalenjin = joinMergedText(target.kalenjin, next.kalenjin);
	const mergedEnglish = joinMergedText(target.english, next.english);

	const targetTokenCount = target.tokens.length;

	if (next.tokens.length > 0) {
		await tx.storySentenceToken.updateMany({
			where: { storySentenceId: next.id },
			data: {
				storySentenceId: target.id,
				tokenOrder: { increment: targetTokenCount }
			}
		});
	}

	await tx.storySentence.update({
		where: { id: target.id },
		data: { kalenjin: mergedKalenjin, english: mergedEnglish }
	});

	await tx.storySentence.delete({ where: { id: next.id } });

	const SHIFT_OFFSET = 1_000_000;
	await tx.storySentence.updateMany({
		where: {
			storyId: target.storyId,
			sentenceOrder: { gt: next.sentenceOrder }
		},
		data: { sentenceOrder: { increment: SHIFT_OFFSET } }
	});
	await tx.storySentence.updateMany({
		where: {
			storyId: target.storyId,
			sentenceOrder: { gte: SHIFT_OFFSET }
		},
		data: { sentenceOrder: { decrement: SHIFT_OFFSET + 1 } }
	});

	await syncStorySentenceToCorpus(tx, target.id);

	return { merged: true };
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
