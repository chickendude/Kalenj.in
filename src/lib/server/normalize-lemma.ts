import { stripEdgePunctuation } from '$lib/server/punctuation';

const COLLAPSE_WHITESPACE = /\s+/g;

/**
 * Normalize a lemma for case-insensitive lookup fields in the database.
 */
export function normalizeLemma(value: string): string {
	const normalizedWhitespace = value
		.trim()
		.replace(COLLAPSE_WHITESPACE, ' ');

	return stripEdgePunctuation(normalizedWhitespace).toLowerCase();
}
