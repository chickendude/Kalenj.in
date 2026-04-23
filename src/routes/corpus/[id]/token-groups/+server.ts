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
import {
	recordObservedWordForm,
	removeObservedWordForm,
	replaceObservedWordForm
} from '$lib/server/observed-word-forms';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';

type EditableToken = OrderedToken & {
	surfaceForm: string;
	normalizedForm: string;
	wordId: string | null;
	inContextTranslation: string | null;
	segments: Array<{
		wordId: string | null;
		normalizedForm: string;
	}>;
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
			action?: 'unsplit';
			sentenceId?: string;
			tokenId?: string;
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
	partOfSpeech: true,
	pluralForm: true,
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
			normalizedForm: true,
			wordId: true,
			inContextTranslation: true,
			segments: {
				select: {
					wordId: true,
					normalizedForm: true
				}
			}
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

function observedLinksForToken(token: EditableToken) {
	return [
		{ wordId: token.wordId, normalizedForm: token.normalizedForm },
		...(token.segments ?? []).map((segment) => ({
			wordId: segment.wordId,
			normalizedForm: segment.normalizedForm
		}))
	];
}

async function removeObservedLinksForToken(tx: Prisma.TransactionClient, token: EditableToken) {
	for (const link of observedLinksForToken(token)) {
		await removeObservedWordForm(tx, link);
	}
}

function hasLexicalSegments(token: EditableToken): boolean {
	return (token.segments ?? []).length > 0;
}

async function applyMerge(
	tx: Prisma.TransactionClient,
	tokens: EditableToken[],
	sourceTokenId: string,
	targetTokenId: string
) {
	const merge = planMergeTokenGroups(tokens, sourceTokenId, targetTokenId);
	const mergedTokens = tokens.filter(
		(token) => token.id === merge.keepTokenId || token.id === merge.removeTokenId
	);

	if (mergedTokens.some(hasLexicalSegments)) {
		throw new Error('Remove lexical segments before merging these words.');
	}

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

	for (const token of mergedTokens) {
		await removeObservedLinksForToken(tx, token);
	}
	await recordObservedWordForm(tx, {
		wordId: merge.wordId,
		normalizedForm: merge.normalizedForm
	});
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
						normalizedForm: token.normalizedForm,
						inContextTranslation: token.inContextTranslation
					}
				]
	);
	const finalRows = assignSequentialTokenOrders(splitRows);
	const splitToken = tokens.find((token) => token.id === split.tokenId);

	if (splitToken && hasLexicalSegments(splitToken)) {
		throw new Error('Remove lexical segments before splitting this word.');
	}

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

	if (splitToken) {
		await removeObservedLinksForToken(tx, splitToken);
		const keptRow = finalRows.find((row) => row.id === splitToken.id);
		await recordObservedWordForm(tx, {
			wordId: splitToken.wordId,
			normalizedForm: keptRow?.normalizedForm
		});
	}
}

async function applySurface(
	tx: Prisma.TransactionClient,
	tokens: EditableToken[],
	tokenId: string,
	surfaceForm: string
) {
	const update = planUpdateTokenGroupSurface(tokens, tokenId, surfaceForm);
	const token = tokens.find((entry) => entry.id === tokenId);

	await tx.exampleSentenceToken.update({
		where: { id: update.id },
		data: {
			surfaceForm: update.surfaceForm,
			normalizedForm: update.normalizedForm
		}
	});

	await replaceObservedWordForm(tx, {
		wordId: token?.wordId,
		normalizedForm: token?.normalizedForm
	}, {
		wordId: token?.wordId,
		normalizedForm: update.normalizedForm
	});
}

async function applyUnsplit(
	tx: Prisma.TransactionClient,
	tokens: EditableToken[],
	tokenId: string
) {
	const token = tokens.find((token) => token.id === tokenId);
	if (!token) {
		throw new Error('Word not found.');
	}

	for (const segment of token.segments ?? []) {
		await removeObservedWordForm(tx, segment);
	}
	await tx.exampleSentenceTokenSegment.deleteMany({ where: { tokenId } });
}

async function applySegments(
	tx: Prisma.TransactionClient,
	tokens: EditableToken[],
	tokenId: string,
	splitPoints: number[]
) {
	const segments = planTokenLexicalSegments(tokens, tokenId, splitPoints);
	const token = tokens.find((token) => token.id === tokenId);

	if (token) {
		await removeObservedLinksForToken(tx, token);
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
	for (const segment of segments) {
		await recordObservedWordForm(tx, {
			wordId: segment.wordId ?? null,
			normalizedForm: segment.normalizedForm
		});
	}
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
		} else if (action === 'unsplit') {
			const tokenId = clean(payload.tokenId);

			await prisma.$transaction((tx) => applyUnsplit(tx, tokens, tokenId));
		} else if (action === 'surface') {
			const tokenId = clean(payload.tokenId);
			const surfaceForm = clean(payload.surfaceForm);

			await prisma.$transaction((tx) => applySurface(tx, tokens, tokenId, surfaceForm));
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
