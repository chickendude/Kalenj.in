import type { Prisma } from '@prisma/client';
import {
	buildAutoLemmaTokenPlans,
	collectLinkedWordIds,
	createExampleSentenceTokensFromPlans,
	createWordSentenceLinks,
	recordAutoLemmaObservedForms,
	resolveAutoLemmaTokenPlans,
	type ExistingLemmaAnnotation
} from '$lib/server/auto-lemma';
import { tokenizeSentence, type TokenizedWord } from '$lib/server/tokenize';

export function buildSyncedTokenRows<T extends Record<string, string>>(
	parentIds: T,
	tokenData: TokenizedWord[],
	existingTokens: ExistingLemmaAnnotation[]
): Array<
	T & {
		tokenOrder: number;
		surfaceForm: string;
		normalizedForm: string;
		wordId?: string;
		inContextTranslation?: string;
	}
> {
	return buildAutoLemmaTokenPlans(tokenData, existingTokens, new Map()).tokens.map((token) => {
		return {
			...parentIds,
			tokenOrder: token.tokenOrder,
			surfaceForm: token.surfaceForm,
			normalizedForm: token.normalizedForm,
			...(token.wordId ? { wordId: token.wordId } : {}),
			...(token.inContextTranslation?.trim()
				? { inContextTranslation: token.inContextTranslation }
				: {})
		};
	});
}

export async function syncExampleSentenceTokens(
	tx: Prisma.TransactionClient,
	exampleSentenceId: string,
	sentenceText: string
): Promise<void> {
	const tokenData = tokenizeSentence(sentenceText);
	const existingTokens = await tx.exampleSentenceToken.findMany({
		where: { exampleSentenceId },
		orderBy: { tokenOrder: 'asc' },
		select: {
			tokenOrder: true,
			surfaceForm: true,
			normalizedForm: true,
			wordId: true,
			inContextTranslation: true,
			word: {
				select: {
					kalenjinNormalized: true
				}
			}
		}
	});

	await tx.exampleSentenceToken.deleteMany({
		where: { exampleSentenceId }
	});

	if (tokenData.length === 0) {
		return;
	}

	const plan = await resolveAutoLemmaTokenPlans(tx, tokenData, existingTokens);
	await createExampleSentenceTokensFromPlans(tx, exampleSentenceId, plan.tokens);
	await createWordSentenceLinks(tx, exampleSentenceId, collectLinkedWordIds(plan.tokens));
	await recordAutoLemmaObservedForms(tx, plan.tokens);

	if (plan.autoLinkedCount > 0) {
		await tx.exampleSentence.update({
			where: { id: exampleSentenceId },
			data: { needsLemmaProofread: true, lemmaProofreadAt: null }
		});
	}
}

export async function syncStorySentenceTokens(
	tx: Prisma.TransactionClient,
	storySentenceId: string,
	sentenceText: string
): Promise<void> {
	const tokenData = tokenizeSentence(sentenceText);
	const existingTokens = await tx.storySentenceToken.findMany({
		where: { storySentenceId },
		orderBy: { tokenOrder: 'asc' },
		select: {
			tokenOrder: true,
			surfaceForm: true,
			normalizedForm: true,
			wordId: true,
			inContextTranslation: true,
			word: {
				select: {
					kalenjinNormalized: true
				}
			}
		}
	});

	await tx.storySentenceToken.deleteMany({
		where: { storySentenceId }
	});

	if (tokenData.length === 0) {
		return;
	}

	await tx.storySentenceToken.createMany({
		data: buildSyncedTokenRows({ storySentenceId }, tokenData, existingTokens)
	});
}
