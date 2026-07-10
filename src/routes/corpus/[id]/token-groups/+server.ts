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
import {
	createWordSentenceLinks,
	linkCompoundMemberTokensByComponents,
	loadAutoLemmaCompoundMatches,
	loadCompoundInContextTranslations
} from '$lib/server/auto-lemma';
import { normalizeToken } from '$lib/server/tokenize';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';

type EditableToken = OrderedToken & {
	surfaceForm: string;
	normalizedForm: string;
	wordId: string | null;
	compoundId: string | null;
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
	  }
	| {
			action?: 'compound';
			sentenceId?: string;
			sourceTokenId?: string;
			targetTokenId?: string;
	  }
	| {
			action?: 'uncompound';
			sentenceId?: string;
			compoundId?: string;
	  }
	| {
			action?: 'compound-link';
			sentenceId?: string;
			compoundId?: string;
			wordId?: string | null;
	  }
	| {
			action?: 'compound-translate';
			sentenceId?: string;
			compoundId?: string;
			inContextTranslation?: string;
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
			compoundId: true,
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
			compound: {
				include: {
					word: {
						select: WORD_SELECT
					}
				}
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

async function removeUnusedSentenceWordLinks(
	tx: Prisma.TransactionClient,
	sentenceId: string,
	wordIds: Array<string | null | undefined>
) {
	for (const wordId of [...new Set(wordIds.filter((id): id is string => Boolean(id)))]) {
		const remainingLink = await tx.exampleSentenceToken.findFirst({
			where: {
				exampleSentenceId: sentenceId,
				OR: [{ wordId }, { segments: { some: { wordId } } }]
			},
			select: { id: true }
		});
		const remainingCompoundLink = remainingLink
			? null
			: await tx.exampleSentenceCompound.findFirst({
					where: { exampleSentenceId: sentenceId, wordId },
					select: { id: true }
				});

		if (!remainingLink && !remainingCompoundLink) {
			await tx.wordSentence.deleteMany({
				where: { wordId, exampleSentenceId: sentenceId }
			});
		}
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

	if (mergedTokens.some((token) => token.compoundId)) {
		throw new Error('Ungroup the compound before combining these words.');
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

	if (splitToken?.compoundId) {
		throw new Error('Ungroup the compound before splitting this word.');
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

	// A renamed member changes the compound span's cached joined form too.
	if (token?.compoundId) {
		const compound = await tx.exampleSentenceCompound.findUnique({
			where: { id: token.compoundId },
			select: { id: true, wordId: true, normalizedForm: true }
		});
		if (compound) {
			const members = await tx.exampleSentenceToken.findMany({
				where: { compoundId: compound.id },
				orderBy: { tokenOrder: 'asc' },
				select: { id: true, surfaceForm: true }
			});
			const joinedSurface = members
				.map((member) => (member.id === token.id ? update.surfaceForm : member.surfaceForm))
				.join(' ');
			const nextNormalizedForm = normalizeToken(joinedSurface);
			if (nextNormalizedForm !== compound.normalizedForm) {
				await tx.exampleSentenceCompound.update({
					where: { id: compound.id },
					data: { normalizedForm: nextNormalizedForm }
				});
				await replaceObservedWordForm(
					tx,
					{ wordId: compound.wordId, normalizedForm: compound.normalizedForm },
					{ wordId: compound.wordId, normalizedForm: nextNormalizedForm }
				);
			}
		}
	}
}

async function applyUnsplit(
	tx: Prisma.TransactionClient,
	sentenceId: string,
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
	await removeUnusedSentenceWordLinks(
		tx,
		sentenceId,
		(token.segments ?? []).map((segment) => segment.wordId)
	);
}

async function applySegments(
	tx: Prisma.TransactionClient,
	sentenceId: string,
	tokens: EditableToken[],
	tokenId: string,
	splitPoints: number[]
) {
	const segments = planTokenLexicalSegments(tokens, tokenId, splitPoints);
	const token = tokens.find((token) => token.id === tokenId);
	const oldWordIds = token ? observedLinksForToken(token).map((link) => link.wordId) : [];

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
	await removeUnusedSentenceWordLinks(tx, sentenceId, oldWordIds);
}

async function loadCompoundForSentence(
	tx: Prisma.TransactionClient,
	sentenceId: string,
	compoundId: string
) {
	const compound = await tx.exampleSentenceCompound.findUnique({
		where: { id: compoundId },
		select: {
			id: true,
			exampleSentenceId: true,
			wordId: true,
			normalizedForm: true,
			inContextTranslation: true
		}
	});

	if (!compound || compound.exampleSentenceId !== sentenceId) {
		throw new Error('Compound group not found.');
	}

	return compound;
}

async function applyCompound(
	tx: Prisma.TransactionClient,
	sentenceId: string,
	tokens: EditableToken[],
	sourceTokenId: string,
	targetTokenId: string
) {
	const source = tokens.find((token) => token.id === sourceTokenId);
	const target = tokens.find((token) => token.id === targetTokenId);

	if (!source || !target) {
		throw new Error('Choose two words from the same sentence.');
	}
	if (source.id === target.id) {
		throw new Error('Choose two different words to group.');
	}

	// Dropping onto (or from) an existing compound extends it, so all of the
	// involved tokens' current groups fold into the new span.
	const compoundIds = new Set(
		[source.compoundId, target.compoundId].filter((id): id is string => Boolean(id))
	);
	const memberIds = new Set([source.id, target.id]);
	for (const token of tokens) {
		if (token.compoundId && compoundIds.has(token.compoundId)) {
			memberIds.add(token.id);
		}
	}

	const memberIndexes = tokens
		.map((token, index) => (memberIds.has(token.id) ? index : -1))
		.filter((index) => index >= 0);
	const isContiguous = memberIndexes.every(
		(index, position) => position === 0 || index === memberIndexes[position - 1] + 1
	);
	if (!isContiguous) {
		throw new Error('Only adjacent words can be grouped.');
	}

	const members = memberIndexes.map((index) => tokens[index]);
	const joinedSurface = members.map((member) => member.surfaceForm).join(' ');
	const normalizedForm = normalizeToken(joinedSurface);

	const oldCompounds = await tx.exampleSentenceCompound.findMany({
		where: { id: { in: [...compoundIds] } },
		select: { id: true, wordId: true, normalizedForm: true, inContextTranslation: true }
	});
	await tx.exampleSentenceCompound.deleteMany({ where: { id: { in: [...compoundIds] } } });
	for (const old of oldCompounds) {
		await removeObservedWordForm(tx, {
			wordId: old.wordId,
			normalizedForm: old.normalizedForm
		});
	}

	// Prefer whatever the extended group already carried; otherwise try to
	// auto-link the joined form against known compound entries.
	const carried = oldCompounds.find((old) => old.wordId) ?? null;
	let wordId = carried?.wordId ?? null;
	let inContextTranslation = carried?.inContextTranslation ?? null;
	if (!wordId) {
		const matches = await loadAutoLemmaCompoundMatches(tx, [normalizedForm]);
		wordId = matches.get(normalizedForm) ?? null;
		if (wordId) {
			const translations = await loadCompoundInContextTranslations(tx, [
				[normalizedForm, wordId]
			]);
			inContextTranslation = translations.get(`${normalizedForm}\u0000${wordId}`) ?? null;
		}
	}

	const compound = await tx.exampleSentenceCompound.create({
		data: {
			exampleSentenceId: sentenceId,
			normalizedForm,
			wordId,
			...(inContextTranslation?.trim() ? { inContextTranslation } : {})
		}
	});
	await tx.exampleSentenceToken.updateMany({
		where: { id: { in: [...memberIds] } },
		data: { compoundId: compound.id }
	});

	if (wordId) {
		await recordObservedWordForm(tx, { wordId, normalizedForm });
		await createWordSentenceLinks(tx, sentenceId, [wordId]);
		await linkCompoundMemberTokensByComponents(tx, sentenceId, compound.id, wordId);
	}
	await removeUnusedSentenceWordLinks(
		tx,
		sentenceId,
		oldCompounds.map((old) => old.wordId)
	);
}

async function applyUncompound(
	tx: Prisma.TransactionClient,
	sentenceId: string,
	compoundId: string
) {
	const compound = await loadCompoundForSentence(tx, sentenceId, compoundId);

	await tx.exampleSentenceCompound.delete({ where: { id: compound.id } });
	if (compound.wordId) {
		await removeObservedWordForm(tx, {
			wordId: compound.wordId,
			normalizedForm: compound.normalizedForm
		});
		await removeUnusedSentenceWordLinks(tx, sentenceId, [compound.wordId]);
	}
}

async function applyCompoundLink(
	tx: Prisma.TransactionClient,
	sentenceId: string,
	compoundId: string,
	wordId: string | null
) {
	const compound = await loadCompoundForSentence(tx, sentenceId, compoundId);

	if (wordId) {
		const word = await tx.word.findUnique({ where: { id: wordId }, select: { id: true } });
		if (!word) {
			throw new Error('Word not found.');
		}
	}

	await tx.exampleSentenceCompound.update({
		where: { id: compound.id },
		data: { wordId }
	});
	await replaceObservedWordForm(
		tx,
		{ wordId: compound.wordId, normalizedForm: compound.normalizedForm },
		{ wordId, normalizedForm: compound.normalizedForm }
	);
	if (wordId) {
		await createWordSentenceLinks(tx, sentenceId, [wordId]);
		await linkCompoundMemberTokensByComponents(tx, sentenceId, compound.id, wordId);
	}
	if (compound.wordId && compound.wordId !== wordId) {
		await removeUnusedSentenceWordLinks(tx, sentenceId, [compound.wordId]);
	}
}

async function applyCompoundTranslate(
	tx: Prisma.TransactionClient,
	sentenceId: string,
	compoundId: string,
	inContextTranslation: string
) {
	const compound = await loadCompoundForSentence(tx, sentenceId, compoundId);

	await tx.exampleSentenceCompound.update({
		where: { id: compound.id },
		data: { inContextTranslation: inContextTranslation.trim() || null }
	});
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	requireEditor(locals);
	const payload = (await request.json()) as Payload;
	const sentenceId = clean(payload.sentenceId);
	const action = payload.action;

	if (!sentenceId) {
		error(400, 'Sentence is required.');
	}

	if (sentenceId !== params.id) {
		error(404, 'Sentence not found.');
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

			await prisma.$transaction((tx) => applySegments(tx, sentenceId, tokens, tokenId, splitPoints));
		} else if (action === 'unsplit') {
			const tokenId = clean(payload.tokenId);

			await prisma.$transaction((tx) => applyUnsplit(tx, sentenceId, tokens, tokenId));
		} else if (action === 'surface') {
			const tokenId = clean(payload.tokenId);
			const surfaceForm = clean(payload.surfaceForm);

			await prisma.$transaction((tx) => applySurface(tx, tokens, tokenId, surfaceForm));
		} else if (action === 'compound') {
			const sourceTokenId = clean(payload.sourceTokenId);
			const targetTokenId = clean(payload.targetTokenId);

			await prisma.$transaction((tx) =>
				applyCompound(tx, sentenceId, tokens, sourceTokenId, targetTokenId)
			);
		} else if (action === 'uncompound') {
			const compoundId = clean(payload.compoundId);

			await prisma.$transaction((tx) => applyUncompound(tx, sentenceId, compoundId));
		} else if (action === 'compound-link') {
			const compoundId = clean(payload.compoundId);
			const wordId = clean(payload.wordId) || null;

			await prisma.$transaction((tx) => applyCompoundLink(tx, sentenceId, compoundId, wordId));
		} else if (action === 'compound-translate') {
			const compoundId = clean(payload.compoundId);
			const inContextTranslation = String(payload.inContextTranslation ?? '');

			await prisma.$transaction((tx) =>
				applyCompoundTranslate(tx, sentenceId, compoundId, inContextTranslation)
			);
		} else {
			error(400, 'Action is required.');
		}
	} catch (editError) {
		error(400, editError instanceof Error ? editError.message : 'Could not update sentence words.');
	}

	const nextTokens = await loadTokensWithWords(sentenceId);
	await prisma.$transaction(async (tx) => {
		await tx.exampleSentence.update({
			where: { id: sentenceId },
			data: { kalenjin: buildSentenceText(nextTokens) }
		});
	});

	return json({
		tokens: nextTokens
	});
};
