export const UNSET_SENTENCE_ENGLISH = '[translation not set]';

export function isUnsetSentenceEnglish(value: string | null | undefined): boolean {
	return value === UNSET_SENTENCE_ENGLISH;
}
