import { stripEdgePunctuation } from '$lib/punctuation';

/**
 * Pure step-builder for the learner lesson player. Runs on both server and
 * client, so it must not import from $lib/server.
 */

type LearnTokenWord = {
	id: string;
	kalenjin: string;
	slug?: string;
	translations: string;
};

export type LearnToken = {
	id: string;
	tokenOrder: number;
	surfaceForm: string;
	normalizedForm: string;
	wordId?: string | null;
	inContextTranslation?: string | null;
	word?: LearnTokenWord | null;
	segments?: Array<{
		id: string;
		surfaceForm: string;
		wordId?: string | null;
		word?: LearnTokenWord | null;
	}>;
};

export type LearnSentence = {
	id: string;
	kalenjin: string;
	english: string;
	audioUrl?: string | null;
	imageUrl?: string | null;
	tokens: LearnToken[];
};

type LearnWord = {
	id: string;
	kalenjin: string;
	slug?: string | null;
	translations: string;
	partOfSpeech?: string | null;
	pluralForm?: string | null;
	isPluralOnly?: boolean;
	imageUrl?: string | null;
	audioUrl?: string | null;
	pluralAudioUrl?: string | null;
	presentAnee?: string | null;
	presentInyee?: string | null;
	presentInee?: string | null;
	presentEchek?: string | null;
	presentOkwek?: string | null;
	presentIchek?: string | null;
	spellings?: Array<{ spelling: string }>;
	observedForms?: Array<{ normalizedForm: string }>;
};

export type LearnLessonWord = {
	id: string;
	wordId?: string | null;
	kalenjin: string;
	translations: string;
	sentenceTranslation?: string | null;
	wordForWordTranslation?: string | null;
	notesMarkdown?: string | null;
	word?: LearnWord | null;
	sentence?: LearnSentence | null;
};

type LearnStorySentence = {
	id: string;
	sentenceOrder: number;
	speaker?: string | null;
	grammarNotes?: string | null;
	exampleSentence: LearnSentence;
};

export type LearnLesson = {
	id: string;
	title: string;
	type: 'VOCABULARY' | 'STORY';
	grammarMarkdown?: string | null;
	sections: Array<{
		id: string;
		title?: string | null;
		notes?: string | null;
		words: LearnLessonWord[];
	}>;
	story?: {
		title: string;
		description?: string | null;
		source?: string | null;
		sentences: LearnStorySentence[];
	} | null;
};

export type BlankResolution =
	| {
			kind: 'sentence';
			/** tokenOrders of the blanked tokens, ascending. */
			blankTokenOrders: number[];
			/** What the learner must type: the blanked surface forms in order. */
			target: string;
	  }
	| {
			/** No sentence tokens matched; fall back to typing the word alone. */
			kind: 'wordOnly';
			target: string;
	  };

/**
 * 'text': Speakly-style fill-in-the-blank from the English prompt.
 * 'audio': dictation — hear the sentence, type the missing word(s).
 */
export type RecallMode = 'text' | 'audio';

export type LessonStep =
	| { kind: 'grammar'; title: string | null; markdown: string }
	| { kind: 'section'; title: string }
	| { kind: 'wordIntro'; lessonWord: LearnLessonWord }
	| { kind: 'recall'; lessonWord: LearnLessonWord; blanks: BlankResolution; mode: RecallMode }
	| { kind: 'storyIntro'; title: string; description: string | null; source: string | null }
	| { kind: 'storySentence'; storySentence: LearnStorySentence }
	| { kind: 'complete' };

const APOSTROPHES = /[‘’ʼ`´]/g;
const APOSTROPHE_LIKE = /^['‘’ʼ`´]$/;
const COLLAPSE_WHITESPACE = /\s+/g;

/**
 * Client-safe equivalent of the server's normalizeLemma, plus apostrophe
 * folding so typed answers aren't marked wrong over quote-style differences.
 */
export function normalizeAnswerText(value: string): string {
	return stripEdgePunctuation(
		value.replace(APOSTROPHES, "'").trim().replace(COLLAPSE_WHITESPACE, ' ')
	).toLowerCase();
}

/**
 * Letters, digits, and apostrophes (part of Kalenjin orthography — ng',
 * lang'at) are typed by the learner; other punctuation is shown for them.
 */
export function isTypeableChar(char: string): boolean {
	return /[\p{L}\p{N}]/u.test(char) || APOSTROPHE_LIKE.test(char);
}

/** Just the characters of `value` the learner actually types. */
export function typeableText(value: string): string {
	return [...value].filter(isTypeableChar).join('');
}

/**
 * Case- and apostrophe-insensitive single-character comparison key. Also
 * folds the Kalenjin a/o spelling alternation (amitwogik/omitwogik,
 * onyiny/anyiny) — the two vowels are interchangeable in written Kalenjin,
 * so a typed answer is never marked wrong over the choice between them.
 */
export function normalizeAnswerChar(char: string): string {
	const folded = char.replace(APOSTROPHES, "'").toLocaleLowerCase();
	return folded === 'o' ? 'a' : folded;
}

/** Comparison key for a whole typed answer: its typeable chars, normalized. */
export function normalizeTypedAnswer(value: string): string {
	return [...typeableText(value)].map(normalizeAnswerChar).join('');
}

/**
 * The set of normalized typed answers a recall drill accepts: the target
 * itself plus close spelling variants of the same word (dictionary spellings
 * and corpus surface forms). a/o alternations are already folded away by
 * `normalizeAnswerChar`; the variant matching admits other small spelling
 * differences — same length as the target, at most 1–2 characters apart —
 * without accepting a different inflection of the same lemma.
 */
export function acceptableAnswers(
	lessonWord: Pick<LearnLessonWord, 'kalenjin' | 'word'>,
	target: string
): Set<string> {
	const normalizedTarget = normalizeTypedAnswer(target);
	const accepted = new Set([normalizedTarget]);
	if (!normalizedTarget) return accepted;

	const maxSubstitutions = normalizedTarget.length >= 6 ? 2 : 1;
	const candidates = [
		lessonWord.kalenjin,
		lessonWord.word?.kalenjin,
		lessonWord.word?.pluralForm,
		...(lessonWord.word?.spellings ?? []).map((entry) => entry.spelling),
		...(lessonWord.word?.observedForms ?? []).map((entry) => entry.normalizedForm)
	];

	for (const candidate of candidates) {
		if (!candidate) continue;
		const normalized = normalizeTypedAnswer(candidate);
		if (normalized.length !== normalizedTarget.length) continue;
		let substitutions = 0;
		for (let i = 0; i < normalized.length; i += 1) {
			if (normalized[i] !== normalizedTarget[i]) substitutions += 1;
			if (substitutions > maxSubstitutions) break;
		}
		if (substitutions <= maxSubstitutions) accepted.add(normalized);
	}

	// Apostrophes are typed but never required — "langat" still counts for
	// "lang'at".
	for (const value of [...accepted]) {
		const stripped = value.replaceAll("'", '');
		if (stripped && stripped !== value) accepted.add(stripped);
	}
	return accepted;
}

function tokenMatchesWordId(token: LearnToken, wordId: string): boolean {
	if (token.wordId === wordId) return true;
	return Boolean(token.segments?.some((segment) => segment.wordId === wordId));
}

/**
 * Work out which sentence tokens should be blanked for a recall exercise.
 *
 * Preference order:
 * 1. Tokens linked (directly or via a segment) to the LessonWord's dictionary
 *    word.
 * 2. A contiguous run of tokens whose normalized forms match the whitespace-
 *    split answer text (covers LessonWords without a wordId, and multi-word
 *    expressions).
 * 3. Fallback: no blanks resolvable — the exercise degrades to typing the
 *    word against its translation, without the sentence.
 */
export function resolveBlanks(
	lessonWord: Pick<LearnLessonWord, 'wordId' | 'kalenjin'>,
	tokens: LearnToken[] | undefined
): BlankResolution {
	const wordOnly: BlankResolution = { kind: 'wordOnly', target: lessonWord.kalenjin };
	if (!tokens?.length) return wordOnly;

	const ordered = [...tokens].sort((a, b) => a.tokenOrder - b.tokenOrder);

	if (lessonWord.wordId) {
		const matched = ordered.filter((token) => tokenMatchesWordId(token, lessonWord.wordId!));
		if (matched.length > 0) {
			return {
				kind: 'sentence',
				blankTokenOrders: matched.map((token) => token.tokenOrder),
				target: matched.map((token) => token.surfaceForm).join(' ')
			};
		}
	}

	const answerParts = lessonWord.kalenjin
		.split(/\s+/)
		.map(normalizeAnswerText)
		.filter((part) => part.length > 0);
	if (answerParts.length === 0) return wordOnly;

	for (let start = 0; start + answerParts.length <= ordered.length; start += 1) {
		const run = ordered.slice(start, start + answerParts.length);
		const matches = run.every(
			(token, i) => normalizeAnswerText(token.normalizedForm) === answerParts[i]
		);
		if (matches) {
			return {
				kind: 'sentence',
				blankTokenOrders: run.map((token) => token.tokenOrder),
				target: run.map((token) => token.surfaceForm).join(' ')
			};
		}
	}

	return wordOnly;
}

/**
 * Whether a recall step is worth showing for this LessonWord. Words without a
 * sample sentence only get an intro step; words whose sentence blanks can't
 * be resolved degrade to typing the word alone against its translation.
 * Audio (dictation) drills additionally need recorded sentence audio.
 */
function recallStepFor(lessonWord: LearnLessonWord, mode: RecallMode): LessonStep | null {
	if (!lessonWord.kalenjin.trim() || !lessonWord.sentence) return null;
	if (mode === 'audio' && !lessonWord.sentence.audioUrl) return null;
	const blanks = resolveBlanks(lessonWord, lessonWord.sentence.tokens);
	return { kind: 'recall', lessonWord, blanks, mode };
}

/**
 * Build the deterministic step list for a lesson.
 *
 * VOCABULARY: optional grammar interstitial, then per section: title card,
 * optional section-notes interstitial, then word intros interleaved with
 * spaced drills — a lag-1 typed recall and a lag-2 audio dictation:
 * intro w1, intro w2, recall w1, intro w3, recall w2, dictation w1, ...,
 * with remaining drills flushed at the section end.
 *
 * STORY: story intro, then one step per story sentence in order.
 */
export function buildLessonSteps(lesson: LearnLesson): LessonStep[] {
	const steps: LessonStep[] = [];

	if (lesson.type === 'STORY' && lesson.story) {
		steps.push({
			kind: 'storyIntro',
			title: lesson.story.title,
			description: lesson.story.description ?? null,
			source: lesson.story.source ?? null
		});
		const sentences = [...lesson.story.sentences].sort(
			(a, b) => a.sentenceOrder - b.sentenceOrder
		);
		for (const storySentence of sentences) {
			steps.push({ kind: 'storySentence', storySentence });
		}
		steps.push({ kind: 'complete' });
		return steps;
	}

	if (lesson.grammarMarkdown?.trim()) {
		steps.push({ kind: 'grammar', title: null, markdown: lesson.grammarMarkdown });
	}

	for (const section of lesson.sections) {
		if (section.title?.trim()) {
			steps.push({ kind: 'section', title: section.title });
		}
		if (section.notes?.trim()) {
			steps.push({ kind: 'grammar', title: section.title ?? null, markdown: section.notes });
		}

		const pushRecall = (lessonWord: LearnLessonWord | null, mode: RecallMode) => {
			if (!lessonWord) return;
			const step = recallStepFor(lessonWord, mode);
			if (step) steps.push(step);
		};

		let prev: LearnLessonWord | null = null;
		let prevPrev: LearnLessonWord | null = null;
		for (const lessonWord of section.words) {
			steps.push({ kind: 'wordIntro', lessonWord });
			pushRecall(prev, 'text');
			pushRecall(prevPrev, 'audio');
			prevPrev = prev;
			prev = lessonWord;
		}
		pushRecall(prev, 'text');
		pushRecall(prevPrev, 'audio');
		pushRecall(prev, 'audio');
	}

	steps.push({ kind: 'complete' });
	return steps;
}

export function clampStepIndex(stepIndex: number, stepCount: number): number {
	if (!Number.isFinite(stepIndex) || stepIndex < 0) return 0;
	return Math.min(Math.floor(stepIndex), Math.max(0, stepCount - 1));
}
