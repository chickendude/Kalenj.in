import { stripEdgePunctuation } from '$lib/server/punctuation';

export type TokenizedWord = {
	// Ordered editable word unit in the sentence. Phrases can be stored as one value with spaces.
	tokenOrder: number;
	surfaceForm: string;
	normalizedForm: string;
};

export function normalizeToken(value: string): string {
	return stripEdgePunctuation(value).toLowerCase();
}

export function tokenizeSentence(sentence: string): TokenizedWord[] {
	const trimmedSentence = sentence.trim();
	if (!trimmedSentence) {
		return [];
	}

	return trimmedSentence
		.split(/\s+/)
		.map((surfaceForm, tokenOrder) => ({
			tokenOrder,
			surfaceForm,
			normalizedForm: normalizeToken(surfaceForm)
		}))
		.filter((token) => token.normalizedForm.length > 0);
}
