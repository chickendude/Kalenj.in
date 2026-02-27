const STRIP_EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const COLLAPSE_WHITESPACE = /\s+/g;

/**
 * Normalize a lemma for case-insensitive lookup fields in the database.
 */
export function normalizeLemma(value: string): string {
	return value
		.trim()
		.replace(COLLAPSE_WHITESPACE, ' ')
		.replace(STRIP_EDGE_PUNCTUATION, '')
		.toLowerCase();
}
