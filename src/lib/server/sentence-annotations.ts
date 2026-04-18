import type { Prisma } from '@prisma/client';
import { tokenizeSentence, type TokenizedWord } from '$lib/server/tokenize';

type ExistingSentenceToken = {
	tokenOrder: number;
	surfaceForm: string;
	normalizedForm: string;
	wordId: string | null;
	inContextTranslation: string | null;
	word?: {
		kalenjinNormalized: string;
	} | null;
};

type PreservedAnnotation = {
	wordId: string | null;
	inContextTranslation: string | null;
};

function hasAnnotation(token: ExistingSentenceToken): boolean {
	return Boolean(token.wordId || token.inContextTranslation?.trim());
}

function findPreservedAnnotation(
	incoming: TokenizedWord,
	existingTokens: ExistingSentenceToken[],
	usedIndexes: Set<number>
): PreservedAnnotation | null {
	const sameOrderIndex = existingTokens.findIndex(
		(existing, index) =>
			!usedIndexes.has(index) &&
			existing.tokenOrder === incoming.tokenOrder &&
			existing.normalizedForm === incoming.normalizedForm &&
			hasAnnotation(existing)
	);

	if (sameOrderIndex >= 0) {
		usedIndexes.add(sameOrderIndex);
		return existingTokens[sameOrderIndex];
	}

	const sameSurfaceIndex = existingTokens.findIndex(
		(existing, index) =>
			!usedIndexes.has(index) &&
			existing.normalizedForm === incoming.normalizedForm &&
			hasAnnotation(existing)
	);

	if (sameSurfaceIndex >= 0) {
		usedIndexes.add(sameSurfaceIndex);
		return existingTokens[sameSurfaceIndex];
	}

	const sameLemmaIndex = existingTokens.findIndex(
		(existing, index) =>
			!usedIndexes.has(index) &&
			Boolean(existing.wordId) &&
			existing.word?.kalenjinNormalized === incoming.normalizedForm
	);

	if (sameLemmaIndex >= 0) {
		usedIndexes.add(sameLemmaIndex);
		return existingTokens[sameLemmaIndex];
	}

	return null;
}

export function buildSyncedTokenRows<T extends Record<string, string>>(
	parentIds: T,
	tokenData: TokenizedWord[],
	existingTokens: ExistingSentenceToken[]
): Array<
	T & {
		tokenOrder: number;
		surfaceForm: string;
		normalizedForm: string;
		wordId?: string;
		inContextTranslation?: string;
	}
> {
	const usedIndexes = new Set<number>();

	return tokenData.map((incoming) => {
		const preserved = findPreservedAnnotation(incoming, existingTokens, usedIndexes);

		return {
			...parentIds,
			tokenOrder: incoming.tokenOrder,
			surfaceForm: incoming.surfaceForm,
			normalizedForm: incoming.normalizedForm,
			...(preserved?.wordId ? { wordId: preserved.wordId } : {}),
			...(preserved?.inContextTranslation?.trim()
				? { inContextTranslation: preserved.inContextTranslation }
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

	await tx.exampleSentenceToken.createMany({
		data: buildSyncedTokenRows({ exampleSentenceId }, tokenData, existingTokens)
	});
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
