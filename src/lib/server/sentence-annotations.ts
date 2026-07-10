import type { Prisma } from '@prisma/client';
import {
	buildAutoLemmaTokenPlans,
	collectLinkedWordIds,
	createExampleSentenceCompoundsFromPlans,
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
	const existingCompounds = await tx.exampleSentenceCompound.findMany({
		where: { exampleSentenceId },
		select: {
			normalizedForm: true,
			wordId: true,
			inContextTranslation: true
		}
	});

	await tx.exampleSentenceToken.deleteMany({
		where: { exampleSentenceId }
	});
	await tx.exampleSentenceCompound.deleteMany({
		where: { exampleSentenceId }
	});

	if (tokenData.length === 0) {
		return;
	}

	const plan = await resolveAutoLemmaTokenPlans(tx, tokenData, existingTokens, existingCompounds);
	await createExampleSentenceTokensFromPlans(tx, exampleSentenceId, plan.tokens);
	await createExampleSentenceCompoundsFromPlans(tx, exampleSentenceId, plan.compounds);
	await createWordSentenceLinks(
		tx,
		exampleSentenceId,
		collectLinkedWordIds(plan.tokens, plan.compounds)
	);
	await recordAutoLemmaObservedForms(tx, plan.tokens, plan.compounds);

	if (plan.autoLinkedCount > 0) {
		await tx.exampleSentence.update({
			where: { id: exampleSentenceId },
			data: { status: 'NEEDS_PROOFREAD', lemmaProofreadAt: null }
		});
	}
}
