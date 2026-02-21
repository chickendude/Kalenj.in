export type TokenizedWord = {
	tokenOrder: number;
	surfaceForm: string;
	normalizedForm: string;
};

const STRIP_EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

function normalizeToken(value: string): string {
	return value.replace(STRIP_EDGE_PUNCTUATION, '').toLowerCase();
}

export function tokenizeSentence(sentence: string): TokenizedWord[] {
	return sentence
		.split(/\s+/)
		.map((surfaceForm, tokenOrder) => ({
			tokenOrder,
			surfaceForm,
			normalizedForm: normalizeToken(surfaceForm)
		}))
		.filter((token) => token.normalizedForm.length > 0);
}
