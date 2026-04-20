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
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';

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
			action?: 'merge';
			sentenceId?: string;
			sourceTokenId?: string;
			targetTokenId?: string;
	  }
	| {
			action?: 'split' | 'segments';
			sentenceId?: string;
			tokenId?: string;
			splitPoints?: number[];
	  }
	| {
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

async function ensureSentence(sentenceId: string) {
	const sentence = await prisma.exampleSentence.findUnique({
		where: { id: sentenceId },
		select: { id: true }
	});

	if (!sentence) {
		error(404, 'Sentence not found.');
	}
}

async function loadEditableTokens(sentenceId: string): Promise<EditableToken[]> {
	return prisma.exampleSentenceToken.findMany({
		where: { exampleSentenceId: sentenceId },
		orderBy: { tokenOrder: 'asc' },
		select: {
			id: true,
			tokenOrder: true,
			surfaceForm: true,
			wordId: true,
			inContextTranslation: true
		}
	});
}

async function loadTokensWithWords(sentenceId: string) {
	return prisma.exampleSentenceToken.findMany({
		where: { exampleSentenceId: sentenceId },
		orderBy: { tokenOrder: 'asc' },
		include: {
			word: {
				select: WORD_SELECT
			},
			segments: {
				orderBy: { segmentOrder: 'asc' },
				include: {
					word: {
						select: WORD_SELECT
					}
				}
			}
		}
	});
}

async function setTemporaryOrders(tx: Prisma.TransactionClient, tokens: OrderedToken[]) {
	for (const update of temporaryTokenOrderUpdates(tokens)) {
		await tx.exampleSentenceToken.update({
			where: { id: update.id },
			data: { tokenOrder: update.tokenOrder }
		});
	}
}

async function applyMerge(
	tx: Prisma.TransactionClient,
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

	await setTemporaryOrders(tx, tokens);
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

	await setTemporaryOrders(tx, tokens);

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

async function applySurface(tokens: EditableToken[], tokenId: string, surfaceForm: string) {
	const update = planUpdateTokenGroupSurface(tokens, tokenId, surfaceForm);

	await prisma.exampleSentenceToken.update({
		where: { id: update.id },
		data: {
			surfaceForm: update.surfaceForm,
			normalizedForm: update.normalizedForm
		}
	});
}

async function applySegments(
	tx: Prisma.TransactionClient,
	tokens: EditableToken[],
	tokenId: string,
	splitPoints: number[]
) {
	const segments = planTokenLexicalSegments(tokens, tokenId, splitPoints);

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
	const sentenceId = clean(payload.sentenceId);
	const action = payload.action;

	if (!sentenceId) {
		return json({ error: 'Sentence is required.' }, { status: 400 });
	}

	if (sentenceId !== params.id) {
		return json({ error: 'Sentence not found.' }, { status: 404 });
	}

	await ensureSentence(sentenceId);
	const tokens = await loadEditableTokens(sentenceId);

	try {
		if (action === 'merge') {
			const sourceTokenId = clean(payload.sourceTokenId);
			const targetTokenId = clean(payload.targetTokenId);

			await prisma.$transaction((tx) => applyMerge(tx, tokens, sourceTokenId, targetTokenId));
		} else if (action === 'split') {
			const tokenId = clean(payload.tokenId);
			const splitPoints = Array.isArray(payload.splitPoints)
				? payload.splitPoints.filter((value) => Number.isInteger(value))
				: undefined;

			await prisma.$transaction((tx) => applySplit(tx, sentenceId, tokens, tokenId, splitPoints));
		} else if (action === 'segments') {
			const tokenId = clean(payload.tokenId);
			const splitPoints = Array.isArray(payload.splitPoints)
				? payload.splitPoints.filter((value) => Number.isInteger(value))
				: [];

			await prisma.$transaction((tx) => applySegments(tx, tokens, tokenId, splitPoints));
		} else if (action === 'surface') {
			const tokenId = clean(payload.tokenId);
			const surfaceForm = clean(payload.surfaceForm);

			await applySurface(tokens, tokenId, surfaceForm);
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

	const nextTokens = await loadTokensWithWords(sentenceId);
	await prisma.exampleSentence.update({
		where: { id: sentenceId },
		data: { kalenjin: buildSentenceText(nextTokens) }
	});

	return json({
		tokens: nextTokens
	});
};
