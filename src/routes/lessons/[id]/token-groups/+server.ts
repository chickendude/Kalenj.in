import { error, json } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/prisma';
import {
	assignSequentialTokenOrders,
	temporaryTokenOrderUpdates,
	type OrderedToken
} from '$lib/server/token-order';
import {
	planMergeTokenGroups,
	planTokenLexicalSegments,
	planSplitTokenGroup,
	planUpdateTokenGroupSurface
} from '$lib/server/token-group-edit';
import { normalizeToken } from '$lib/server/tokenize';
import { syncStorySentenceToCorpus } from '$lib/server/story-sync';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';

type SentenceKind = 'story' | 'example';
type EditableToken = OrderedToken & {
	surfaceForm: string;
	wordId: string | null;
	inContextTranslation: string | null;
};
type SplitRow = {
	id: string | null;
	surfaceForm: string;
	normalizedForm: string;
	inContextTranslation: string | null;
};

type Payload =
	| {
			kind?: SentenceKind;
			action?: 'merge';
			sentenceId?: string;
			sourceTokenId?: string;
			targetTokenId?: string;
	  }
	| {
			kind?: SentenceKind;
			action?: 'split' | 'segments';
			sentenceId?: string;
			tokenId?: string;
			splitPoints?: number[];
	  }
	| {
			kind?: SentenceKind;
			action?: 'unsplit';
			sentenceId?: string;
			tokenId?: string;
	  }
	| {
			kind?: SentenceKind;
			action?: 'surface';
			sentenceId?: string;
			tokenId?: string;
			surfaceForm?: string;
	  };

const WORD_SELECT = {
	id: true,
	kalenjin: true,
	translations: true,
	notes: true,
	partOfSpeech: true,
	spellings: {
		orderBy: [{ spelling: 'asc' as const }],
		select: {
			id: true,
			spelling: true,
			spellingNormalized: true
		}
	}
};

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

function buildSentenceText(tokens: Array<{ surfaceForm: string }>): string {
	return tokens.map((token) => token.surfaceForm).join(' ');
}

async function ensureSentence(lessonId: string, kind: SentenceKind, sentenceId: string) {
	if (kind === 'story') {
		const lesson = await prisma.lesson.findUnique({
			where: { id: lessonId },
			select: { storyId: true }
		});

		if (!lesson?.storyId) {
			error(404, 'Story lesson not found.');
		}

		const sentence = await prisma.storySentence.findUnique({
			where: { id: sentenceId },
			select: { id: true, storyId: true }
		});

		if (!sentence || sentence.storyId !== lesson.storyId) {
			error(404, 'Story sentence not found.');
		}

		return;
	}

	const lessonWord = await prisma.lessonWord.findFirst({
		where: {
			sentenceId,
			lessonSection: {
				lessonId
			}
		},
		select: { id: true }
	});

	if (!lessonWord) {
		error(404, 'Lesson sentence not found.');
	}
}

async function loadEditableTokens(kind: SentenceKind, sentenceId: string): Promise<EditableToken[]> {
	const select = {
		id: true,
		tokenOrder: true,
		surfaceForm: true,
		wordId: true,
		inContextTranslation: true
	};

	if (kind === 'story') {
		return prisma.storySentenceToken.findMany({
			where: { storySentenceId: sentenceId },
			orderBy: { tokenOrder: 'asc' },
			select
		});
	}

	return prisma.exampleSentenceToken.findMany({
		where: { exampleSentenceId: sentenceId },
		orderBy: { tokenOrder: 'asc' },
		select
	});
}

async function loadTokensWithWords(kind: SentenceKind, sentenceId: string) {
	const include = {
		word: {
			select: WORD_SELECT
		}
	};

	if (kind === 'story') {
		return prisma.storySentenceToken.findMany({
			where: { storySentenceId: sentenceId },
			orderBy: { tokenOrder: 'asc' },
			include: {
				...include,
				segments: {
					orderBy: { segmentOrder: 'asc' },
					include
				}
			}
		});
	}

	return prisma.exampleSentenceToken.findMany({
		where: { exampleSentenceId: sentenceId },
		orderBy: { tokenOrder: 'asc' },
		include: {
			...include,
			segments: {
				orderBy: { segmentOrder: 'asc' },
				include
			}
		}
	});
}

async function updateSentenceText(kind: SentenceKind, sentenceId: string, sentenceText: string) {
	if (kind === 'story') {
		await prisma.storySentence.update({
			where: { id: sentenceId },
			data: { kalenjin: sentenceText }
		});
		return;
	}

	await prisma.exampleSentence.update({
		where: { id: sentenceId },
		data: { kalenjin: sentenceText }
	});
}

async function setTemporaryOrders(
	tx: Prisma.TransactionClient,
	kind: SentenceKind,
	tokens: OrderedToken[]
) {
	for (const update of temporaryTokenOrderUpdates(tokens)) {
		if (kind === 'story') {
			await tx.storySentenceToken.update({
				where: { id: update.id },
				data: { tokenOrder: update.tokenOrder }
			});
		} else {
			await tx.exampleSentenceToken.update({
				where: { id: update.id },
				data: { tokenOrder: update.tokenOrder }
			});
		}
	}
}

async function applyMerge(
	tx: Prisma.TransactionClient,
	kind: SentenceKind,
	tokens: EditableToken[],
	sourceTokenId: string,
	targetTokenId: string
) {
	const merge = planMergeTokenGroups(tokens, sourceTokenId, targetTokenId);
	const finalTokens = assignSequentialTokenOrders(
		tokens
			.filter((token) => token.id !== merge.removeTokenId)
			.map((token) =>
				token.id === merge.keepTokenId
					? {
							...token,
							surfaceForm: merge.surfaceForm,
							wordId: merge.wordId,
							inContextTranslation: merge.inContextTranslation
						}
					: token
			)
	);

	await setTemporaryOrders(tx, kind, tokens);

	if (kind === 'story') {
		await tx.storySentenceToken.delete({ where: { id: merge.removeTokenId } });
		for (const token of finalTokens) {
			await tx.storySentenceToken.update({
				where: { id: token.id },
				data: {
					tokenOrder: token.tokenOrder,
					...(token.id === merge.keepTokenId
						? {
								surfaceForm: merge.surfaceForm,
								normalizedForm: merge.normalizedForm,
								wordId: merge.wordId,
								inContextTranslation: merge.inContextTranslation
							}
						: {})
				}
			});
		}
		return;
	}

	await tx.exampleSentenceToken.delete({ where: { id: merge.removeTokenId } });
	for (const token of finalTokens) {
		await tx.exampleSentenceToken.update({
			where: { id: token.id },
			data: {
				tokenOrder: token.tokenOrder,
				...(token.id === merge.keepTokenId
					? {
							surfaceForm: merge.surfaceForm,
							normalizedForm: merge.normalizedForm,
							wordId: merge.wordId,
							inContextTranslation: merge.inContextTranslation
						}
					: {})
			}
		});
	}
}

async function applySplit(
	tx: Prisma.TransactionClient,
	kind: SentenceKind,
	sentenceId: string,
	tokens: EditableToken[],
	tokenId: string,
	splitPoints?: number[]
) {
	const split = planSplitTokenGroup(tokens, tokenId, splitPoints);
	const splitRows: SplitRow[] = tokens.flatMap((token): SplitRow[] =>
		token.id === split.tokenId
			? split.parts.map((part, index): SplitRow => ({
					id: index === 0 ? token.id : null,
					surfaceForm: part.surfaceForm,
					normalizedForm: part.normalizedForm,
					inContextTranslation: part.inContextTranslation
				}))
			: [
					{
						id: token.id,
						surfaceForm: token.surfaceForm,
						normalizedForm: normalizeToken(token.surfaceForm),
						inContextTranslation: token.inContextTranslation
					}
				]
	);
	const finalRows = assignSequentialTokenOrders(splitRows);

	await setTemporaryOrders(tx, kind, tokens);

	if (kind === 'story') {
		for (const row of finalRows) {
			if (row.id) {
				await tx.storySentenceToken.update({
					where: { id: row.id },
					data: {
						tokenOrder: row.tokenOrder,
						surfaceForm: row.surfaceForm,
						normalizedForm: row.normalizedForm,
						inContextTranslation: row.inContextTranslation
					}
				});
			} else {
				await tx.storySentenceToken.create({
					data: {
						storySentenceId: sentenceId,
						tokenOrder: row.tokenOrder,
						surfaceForm: row.surfaceForm,
						normalizedForm: row.normalizedForm,
						inContextTranslation: row.inContextTranslation
					}
				});
			}
		}
		return;
	}

	for (const row of finalRows) {
		if (row.id) {
			await tx.exampleSentenceToken.update({
				where: { id: row.id },
				data: {
					tokenOrder: row.tokenOrder,
					surfaceForm: row.surfaceForm,
					normalizedForm: row.normalizedForm,
					inContextTranslation: row.inContextTranslation
				}
			});
		} else {
			await tx.exampleSentenceToken.create({
				data: {
					exampleSentenceId: sentenceId,
					tokenOrder: row.tokenOrder,
					surfaceForm: row.surfaceForm,
					normalizedForm: row.normalizedForm,
					inContextTranslation: row.inContextTranslation
				}
			});
		}
	}
}

async function applySurface(
	kind: SentenceKind,
	tokens: EditableToken[],
	tokenId: string,
	surfaceForm: string
) {
	const update = planUpdateTokenGroupSurface(tokens, tokenId, surfaceForm);

	if (kind === 'story') {
		await prisma.storySentenceToken.update({
			where: { id: update.id },
			data: {
				surfaceForm: update.surfaceForm,
				normalizedForm: update.normalizedForm
			}
		});
		return;
	}

	await prisma.exampleSentenceToken.update({
		where: { id: update.id },
		data: {
			surfaceForm: update.surfaceForm,
			normalizedForm: update.normalizedForm
		}
	});
}

async function applyUnsplit(
	tx: Prisma.TransactionClient,
	kind: SentenceKind,
	tokens: EditableToken[],
	tokenId: string
) {
	if (!tokens.some((token) => token.id === tokenId)) {
		throw new Error('Word not found.');
	}

	if (kind === 'story') {
		await tx.storySentenceTokenSegment.deleteMany({ where: { tokenId } });
		return;
	}

	await tx.exampleSentenceTokenSegment.deleteMany({ where: { tokenId } });
}

async function applySegments(
	tx: Prisma.TransactionClient,
	kind: SentenceKind,
	tokens: EditableToken[],
	tokenId: string,
	splitPoints: number[]
) {
	const segments = planTokenLexicalSegments(tokens, tokenId, splitPoints);

	if (kind === 'story') {
		await tx.storySentenceToken.update({
			where: { id: tokenId },
			data: { wordId: null }
		});
		await tx.storySentenceTokenSegment.deleteMany({ where: { tokenId } });
		await tx.storySentenceTokenSegment.createMany({
			data: segments.map((segment) => ({
				tokenId,
				...segment
			}))
		});
		return;
	}

	await tx.exampleSentenceToken.update({
		where: { id: tokenId },
		data: { wordId: null }
	});
	await tx.exampleSentenceTokenSegment.deleteMany({ where: { tokenId } });
	await tx.exampleSentenceTokenSegment.createMany({
		data: segments.map((segment) => ({
			tokenId,
			...segment
		}))
	});
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	requireEditor(locals);
	const payload = (await request.json()) as Payload;
	const kind = payload.kind;
	const action = payload.action;
	const sentenceId = clean(payload.sentenceId);

	if (!sentenceId || (kind !== 'story' && kind !== 'example')) {
		return json({ error: 'Sentence is required.' }, { status: 400 });
	}

	await ensureSentence(params.id, kind, sentenceId);
	const tokens = await loadEditableTokens(kind, sentenceId);

	try {
		if (action === 'merge') {
			const sourceTokenId = clean(payload.sourceTokenId);
			const targetTokenId = clean(payload.targetTokenId);

			await prisma.$transaction((tx) =>
				applyMerge(tx, kind, tokens, sourceTokenId, targetTokenId)
			);
		} else if (action === 'split') {
			const tokenId = clean(payload.tokenId);
			const splitPoints = Array.isArray(payload.splitPoints)
				? payload.splitPoints.filter((value) => Number.isInteger(value))
				: undefined;

			await prisma.$transaction((tx) =>
				applySplit(tx, kind, sentenceId, tokens, tokenId, splitPoints)
			);
		} else if (action === 'segments') {
			const tokenId = clean(payload.tokenId);
			const splitPoints = Array.isArray(payload.splitPoints)
				? payload.splitPoints.filter((value) => Number.isInteger(value))
				: [];

			await prisma.$transaction((tx) => applySegments(tx, kind, tokens, tokenId, splitPoints));
		} else if (action === 'unsplit') {
			const tokenId = clean(payload.tokenId);

			await prisma.$transaction((tx) => applyUnsplit(tx, kind, tokens, tokenId));
		} else if (action === 'surface') {
			const tokenId = clean(payload.tokenId);
			const surfaceForm = clean(payload.surfaceForm);

			await applySurface(kind, tokens, tokenId, surfaceForm);
		} else {
			return json({ error: 'Action is required.' }, { status: 400 });
		}
	} catch (editError) {
		return json(
			{
				error: editError instanceof Error ? editError.message : 'Could not update sentence words.'
			},
			{ status: 400 }
		);
	}

	const nextTokens = await loadTokensWithWords(kind, sentenceId);
	await updateSentenceText(kind, sentenceId, buildSentenceText(nextTokens));
	if (kind === 'story') {
		await prisma.$transaction((tx) => syncStorySentenceToCorpus(tx, sentenceId));
	}

	return json({
		tokens: nextTokens
	});
};
