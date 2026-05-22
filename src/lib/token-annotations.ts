// Pure helpers extracted from SentenceTokenAnnotations.svelte. No component
// state or runes here — keep this module side-effect free and unit-testable.

export type SplitPart = { text: string; start: number; end: number };

/** Normalize a free-text search query: drop sentence punctuation, collapse
 * whitespace, lowercase. */
export function normalizeSearchQuery(value: string): string {
	return value
		.replace(/[.,!?]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/** Strip leading/trailing non-letter/number/mark characters (keeps internal
 * punctuation like apostrophes and hyphens). */
export function stripSurroundingPunctuation(value: string): string {
	return value.replace(/^[^\p{L}\p{M}\p{N}]+/u, '').replace(/[^\p{L}\p{M}\p{N}]+$/u, '');
}

/** Join a list of spelling rows into a comma-separated string. */
export function serializeSpellings(
	spellings: Array<{ spelling: string }> | null | undefined
): string {
	return spellings?.map((spelling) => spelling.spelling).join(', ') ?? '';
}

/** Slice `text` at the given split offsets into contiguous, non-empty parts. */
export function computeSplitParts(text: string, splits: number[]): SplitPart[] {
	const bounds = [0, ...splits, text.length];
	const parts: SplitPart[] = [];
	for (let i = 0; i < bounds.length - 1; i += 1) {
		const start = bounds[i];
		const end = bounds[i + 1];
		if (end > start) {
			parts.push({ text: text.slice(start, end), start, end });
		}
	}
	return parts;
}

/** Which split part a character index falls into, given the split offsets. */
export function partIndexForChar(charIndex: number, splits: number[]): number {
	let idx = 0;
	for (const sp of splits) {
		if (sp <= charIndex) {
			idx += 1;
		}
	}
	return idx;
}

/** Index of `segment` within `token.segments`, or -1 if absent. */
export function activeSegmentIndex(
	token: { segments?: Array<{ id: string }> | null } | null,
	segment: { id: string } | null
): number {
	if (!token || !segment) return -1;
	return token.segments?.findIndex((entry) => entry.id === segment.id) ?? -1;
}
