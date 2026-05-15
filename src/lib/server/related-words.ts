/**
 * Related-word pairs are stored once, with the lexicographically smaller word
 * id first, so the relationship is symmetric regardless of which side links it.
 */
export function relatedWordPair(
	wordId: string,
	relatedWordId: string
): { wordId: string; relatedWordId: string } {
	return wordId < relatedWordId
		? { wordId, relatedWordId }
		: { wordId: relatedWordId, relatedWordId: wordId };
}
