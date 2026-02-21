export type TokenizedWord = {
	tokenOrder: number;
	wordIndex: number;
	segmentStart: number;
	segmentEnd: number;
	surfaceForm: string;
	normalizedForm: string;
};

const STRIP_EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function normalizeToken(value: string): string {
	return value.replace(STRIP_EDGE_PUNCTUATION, '').toLowerCase();
}

export function tokenizeSentence(sentence: string): TokenizedWord[] {
	return sentence
		.split(/\s+/)
		.map((surfaceForm, wordIndex) => ({
			wordIndex,
			surfaceForm
		}))
		.map(({ wordIndex, surfaceForm }, tokenOrder) => ({
			tokenOrder,
			wordIndex,
			segmentStart: 0,
			segmentEnd: surfaceForm.length,
			surfaceForm,
			normalizedForm: normalizeToken(surfaceForm)
		}))
		.filter((token) => token.normalizedForm.length > 0);
}
