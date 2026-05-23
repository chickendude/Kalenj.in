import type { Prisma } from '@prisma/client';
import { parseStoryImportText } from '$lib/story-import';
import { prisma } from '$lib/server/prisma';
import {
	collectLinkedWordIds,
	createExampleSentenceTokensFromPlans,
	createExampleSentenceWithAutoLemma,
	createWordSentenceLinks,
	recordAutoLemmaObservedForms,
	resolveAutoLemmaTokenPlans,
	type AutoLemmaTokenPlan
} from '$lib/server/auto-lemma';
import { splitIntoSentences, splitSentenceText } from '$lib/story-split';
import { tokenizeSentence, type TokenizedWord } from '$lib/server/tokenize';

type ExampleTokenSnapshot = {
	tokenOrder: number;
	surfaceForm: string;
	normalizedForm: string;
	wordId: string | null;
	inContextTranslation: string | null;
	segments: Array<{
		segmentOrder: number;
		segmentStart: number;
		segmentEnd: number;
		surfaceForm: string;
		normalizedForm: string;
		wordId: string | null;
	}>;
};

function tokenPlanFromSnapshot(
	tokenData: TokenizedWord,
	snapshot: ExampleTokenSnapshot | undefined
): AutoLemmaTokenPlan {
	return {
		tokenOrder: tokenData.tokenOrder,
		surfaceForm: tokenData.surfaceForm,
		normalizedForm: tokenData.normalizedForm,
		wordId: snapshot?.wordId ?? null,
		inContextTranslation: snapshot?.inContextTranslation ?? null,
		segments:
			snapshot?.segments.map((segment) => ({
				...segment,
				autoLinked: false
			})) ?? [],
		autoLinked: false
	};
}

async function replaceExampleSentenceTokens(
	tx: Prisma.TransactionClient,
	exampleSentenceId: string,
	tokenData: TokenizedWord[],
	preservedTokens: ExampleTokenSnapshot[] = []
): Promise<void> {
	await tx.exampleSentenceToken.deleteMany({ where: { exampleSentenceId } });

	if (tokenData.length === 0) {
		await tx.wordSentence.deleteMany({ where: { exampleSentenceId } });
		return;
	}

	const canPreserve = tokenData.length === preservedTokens.length;
	const plan = canPreserve
		? {
				tokens: tokenData.map((token, index) => tokenPlanFromSnapshot(token, preservedTokens[index])),
				autoLinkedCount: 0
			}
		: await resolveAutoLemmaTokenPlans(tx, tokenData, preservedTokens);

	await createExampleSentenceTokensFromPlans(tx, exampleSentenceId, plan.tokens);
	await tx.wordSentence.deleteMany({ where: { exampleSentenceId } });
	await createWordSentenceLinks(tx, exampleSentenceId, collectLinkedWordIds(plan.tokens));
	await recordAutoLemmaObservedForms(tx, plan.tokens);

	if (plan.autoLinkedCount > 0) {
		await tx.exampleSentence.update({
			where: { id: exampleSentenceId },
			data: { needsLemmaProofread: true, lemmaProofreadAt: null }
		});
	}
}

async function createStoryExampleSentence(
	tx: Prisma.TransactionClient,
	kalenjin: string,
	english: string
): Promise<{ id: string }> {
	return createExampleSentenceWithAutoLemma(tx, {
		kalenjin,
		english,
		tokenData: tokenizeSentence(kalenjin)
	});
}

export async function syncStorySentenceToCorpus(
	tx: Prisma.TransactionClient,
	storySentenceId: string
): Promise<void> {
	const storySentence = await tx.storySentence.findUnique({
		where: { id: storySentenceId },
		select: { exampleSentenceId: true }
	});

	if (!storySentence) {
		return;
	}

	const exampleSentence = await tx.exampleSentence.findUnique({
		where: { id: storySentence.exampleSentenceId },
		select: { id: true, kalenjin: true, tokens: { select: { id: true }, take: 1 } }
	});

	if (exampleSentence && exampleSentence.kalenjin.trim().length > 0 && exampleSentence.tokens.length === 0) {
		await replaceExampleSentenceTokens(
			tx,
			exampleSentence.id,
			tokenizeSentence(exampleSentence.kalenjin)
		);
	}
}

export async function backfillMissingStoryCorpusEntries(storyId?: string): Promise<void> {
	const missingTokenSentences = await prisma.storySentence.findMany({
		where: {
			...(storyId ? { storyId } : {}),
			exampleSentence: { tokens: { none: {} } }
		},
		select: {
			exampleSentence: {
				select: { id: true, kalenjin: true }
			}
		},
		orderBy: [{ storyId: 'asc' }, { sentenceOrder: 'asc' }]
	});

	if (missingTokenSentences.length === 0) {
		return;
	}

	await prisma.$transaction(async (tx) => {
		for (const sentence of missingTokenSentences) {
			await replaceExampleSentenceTokens(
				tx,
				sentence.exampleSentence.id,
				tokenizeSentence(sentence.exampleSentence.kalenjin)
			);
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
			exampleSentenceId: true,
			sentenceOrder: true,
			speaker: true,
			exampleSentence: {
				select: {
					kalenjin: true,
					english: true,
					notes: true,
					imageUrl: true,
					audioUrl: true,
					audioRecordedById: true,
					audioRecordedAt: true,
					needsLemmaProofread: true,
					lemmaProofreadAt: true,
					lessonWords: { select: { id: true }, take: 1 },
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
			}
		}
	});

	if (!original) {
		throw new Error('Story sentence not found.');
	}

	const pieces = splitIntoSentences(
		original.exampleSentence.kalenjin,
		original.exampleSentence.english
	);

	if (pieces.length <= 1) {
		return { splitCount: 1 };
	}

	if (original.exampleSentence.lessonWords.length > 0) {
		throw new Error('Cannot split a story sentence while it is used by a lesson word.');
	}

	const pieceTokens = pieces.map((piece) => tokenizeSentence(piece.kalenjin));

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

	await tx.exampleSentence.update({
		where: { id: original.exampleSentenceId },
		data: { kalenjin: pieces[0].kalenjin, english: pieces[0].english }
	});
	await replaceExampleSentenceTokens(
		tx,
		original.exampleSentenceId,
		pieceTokens[0],
		original.exampleSentence.tokens.slice(0, pieceTokens[0].length)
	);

	let cursor = pieceTokens[0].length;
	for (let i = 1; i < pieces.length; i++) {
		const exampleSentence = await tx.exampleSentence.create({
			data: {
				kalenjin: pieces[i].kalenjin,
				english: pieces[i].english,
				notes: original.exampleSentence.notes,
				imageUrl: original.exampleSentence.imageUrl,
				audioUrl: original.exampleSentence.audioUrl,
				audioRecordedById: original.exampleSentence.audioRecordedById,
				audioRecordedAt: original.exampleSentence.audioRecordedAt,
				needsLemmaProofread: original.exampleSentence.needsLemmaProofread,
				lemmaProofreadAt: original.exampleSentence.lemmaProofreadAt
			},
			select: { id: true }
		});
		await replaceExampleSentenceTokens(
			tx,
			exampleSentence.id,
			pieceTokens[i],
			original.exampleSentence.tokens.slice(cursor, cursor + pieceTokens[i].length)
		);
		cursor += pieceTokens[i].length;

		await tx.storySentence.create({
			data: {
				storyId: original.storyId,
				exampleSentenceId: exampleSentence.id,
				sentenceOrder: original.sentenceOrder + i,
				speaker: original.speaker
			}
		});
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
			exampleSentenceId: true,
			sentenceOrder: true,
			exampleSentence: {
				select: {
					kalenjin: true,
					english: true,
					notes: true,
					imageUrl: true,
					audioUrl: true,
					audioRecordedById: true,
					audioRecordedAt: true,
					needsLemmaProofread: true,
					lemmaProofreadAt: true,
					lessonWords: { select: { id: true }, take: 1 },
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
			}
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
			exampleSentenceId: true,
			sentenceOrder: true,
			exampleSentence: {
				select: {
					kalenjin: true,
					english: true,
					notes: true,
					imageUrl: true,
					audioUrl: true,
					audioRecordedById: true,
					audioRecordedAt: true,
					needsLemmaProofread: true,
					lemmaProofreadAt: true,
					lessonWords: { select: { id: true }, take: 1 },
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
			}
		}
	});

	if (!next) {
		return { merged: false };
	}

	if (
		target.exampleSentence.lessonWords.length > 0 ||
		next.exampleSentence.lessonWords.length > 0
	) {
		throw new Error('Cannot merge story sentences while either sentence is used by a lesson word.');
	}

	const mergedKalenjin = joinMergedText(
		target.exampleSentence.kalenjin,
		next.exampleSentence.kalenjin
	);
	const mergedEnglish = joinMergedText(target.exampleSentence.english, next.exampleSentence.english);
	const conflictingMetadata =
		(Boolean(target.exampleSentence.notes) &&
			Boolean(next.exampleSentence.notes) &&
			target.exampleSentence.notes !== next.exampleSentence.notes) ||
		(Boolean(target.exampleSentence.imageUrl) &&
			Boolean(next.exampleSentence.imageUrl) &&
			target.exampleSentence.imageUrl !== next.exampleSentence.imageUrl) ||
		(Boolean(target.exampleSentence.audioUrl) &&
			Boolean(next.exampleSentence.audioUrl) &&
			target.exampleSentence.audioUrl !== next.exampleSentence.audioUrl);

	if (conflictingMetadata) {
		throw new Error('Cannot merge story sentences with separate notes, images, or audio.');
	}
	const needsLemmaProofread =
		target.exampleSentence.needsLemmaProofread || next.exampleSentence.needsLemmaProofread;

	await tx.exampleSentence.update({
		where: { id: target.exampleSentenceId },
		data: {
			kalenjin: mergedKalenjin,
			english: mergedEnglish,
			notes: target.exampleSentence.notes ?? next.exampleSentence.notes,
			imageUrl: target.exampleSentence.imageUrl ?? next.exampleSentence.imageUrl,
			audioUrl: target.exampleSentence.audioUrl ?? next.exampleSentence.audioUrl,
			audioRecordedById:
				target.exampleSentence.audioRecordedById ?? next.exampleSentence.audioRecordedById,
			audioRecordedAt: target.exampleSentence.audioRecordedAt ?? next.exampleSentence.audioRecordedAt,
			needsLemmaProofread,
			lemmaProofreadAt: needsLemmaProofread
				? null
				: (target.exampleSentence.lemmaProofreadAt ?? next.exampleSentence.lemmaProofreadAt)
		}
	});

	await replaceExampleSentenceTokens(
		tx,
		target.exampleSentenceId,
		tokenizeSentence(mergedKalenjin),
		[...target.exampleSentence.tokens, ...next.exampleSentence.tokens]
	);

	await tx.storySentence.delete({ where: { id: next.id } });
	await tx.exampleSentence.delete({ where: { id: next.exampleSentenceId } });

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

	return { merged: true };
}

export async function syncStorySentences(
	tx: Prisma.TransactionClient,
	storyId: string,
	storyText: string | null
): Promise<void> {
	const sentences = storyText ? parseStoryImportText(storyText) : [];
	const existing = await tx.storySentence.findMany({
		where: { storyId },
		select: { exampleSentenceId: true }
	});

	await tx.storySentence.deleteMany({
		where: { storyId }
	});

	if (existing.length > 0) {
		const existingExampleIds = existing.map((sentence) => sentence.exampleSentenceId);
		const stillReferenced = await tx.lessonWord.findMany({
			where: { sentenceId: { in: existingExampleIds } },
			select: { sentenceId: true }
		});
		const stillReferencedIds = new Set(stillReferenced.map((lessonWord) => lessonWord.sentenceId));
		const orphanedExampleIds = existingExampleIds.filter((id) => !stillReferencedIds.has(id));

		if (orphanedExampleIds.length > 0) {
			await tx.exampleSentence.deleteMany({
				where: { id: { in: orphanedExampleIds } }
			});
		}
	}

	for (const sentence of sentences) {
		const exampleSentence = await createStoryExampleSentence(
			tx,
			sentence.kalenjin,
			sentence.english
		);

		await tx.storySentence.create({
			data: {
				storyId,
				exampleSentenceId: exampleSentence.id,
				sentenceOrder: sentence.sentenceOrder,
				speaker: sentence.speaker
			}
		});
	}
}
