// Visibility rule for the corpus duplicates screen.
//
// A same-spelling group is only worth reviewing if it has at least two
// sentences AND at least one of them is not already flagged as intentionally
// unique. If every copy is marked unique the repetition is deliberate (e.g. an
// ambiguous sentence with two valid readings), so it stays hidden — but a
// newly added, unmarked copy with that spelling re-surfaces the whole group
// for review.
export function isDuplicateGroupVisible(sentences: { isUnique: boolean }[]): boolean {
	return sentences.length > 1 && sentences.some((s) => !s.isUnique);
}
