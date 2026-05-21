export const STRIP_EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function stripEdgePunctuation(value: string): string {
	return value.replace(STRIP_EDGE_PUNCTUATION, '');
}
