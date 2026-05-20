// Picks the default "keep this sentence" target when opening the merge panel.
//
// Preference: the copy with the richest annotation (most tokens carrying a
// linked lemma plus an in-context translation). But if any copy in the group
// is owned by a story or attached to a lesson, defaulting to a different
// "more complete" copy could repoint that lesson/story to another sentence's
// tokens — so in that case fall back to the safe non-story default and let the
// editor decide explicitly.

type TokenLike = {
	word: unknown | null;
	inContextTranslation: string | null;
	segments: ReadonlyArray<{ word: unknown | null }>;
};

export type MergeTargetCandidate = {
	storySentence: unknown | null;
	lessonWords: ReadonlyArray<unknown>;
	tokens: ReadonlyArray<TokenLike>;
};

export function lemmaScore(sentence: MergeTargetCandidate): number {
	let score = 0;
	for (const t of sentence.tokens) {
		if (t.word != null || t.segments.some((g) => g.word != null)) score += 1;
		if (t.inContextTranslation && t.inContextTranslation.trim().length > 0) score += 1;
	}
	return score;
}

export function pickDefaultMergeTarget<T extends MergeTargetCandidate>(sentences: T[]): T {
	if (sentences.length === 0) {
		throw new Error('pickDefaultMergeTarget requires at least one sentence.');
	}

	const hasLessonOrStory = sentences.some(
		(s) => s.storySentence != null || s.lessonWords.length > 0
	);

	if (hasLessonOrStory) {
		return sentences.find((s) => s.storySentence == null) ?? sentences[0];
	}

	// No lesson/story copies: safe to keep the most complete one. Strict `>` so
	// the earliest sentence wins ties (stable, matches load order).
	return sentences.reduce((best, s) => (lemmaScore(s) > lemmaScore(best) ? s : best));
}
