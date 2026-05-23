// Pure planning logic for folding duplicate corpus sentences into one survivor
// without losing audio or translations. The route action turns a plan into the
// actual Prisma writes; keeping this framework-free makes the rules testable.

export type MergeSentence = {
	id: string;
	normalizedKey: string;
	/** Placed in a story, so deleting it would break the story placement. */
	storySourced: boolean;
	/** Referenced by a LessonWord (LessonWord.sentenceId is unique + onDelete: Restrict). */
	hasLessonWord: boolean;
	english: string;
	notes: string | null;
	audioUrl: string | null;
	imageUrl: string | null;
};

export type MergeChoices = {
	targetId: string;
	english: string;
	notes: string | null;
	/** Sentence id to copy audio from; null clears audio on the survivor. */
	audioSourceId: string | null;
	/** Sentence id to copy the image from; null clears the image on the survivor. */
	imageSourceId: string | null;
};

type MergeSkipReason = 'story' | 'lesson-conflict';

type MergeSkip = { id: string; reason: MergeSkipReason };

export type SentenceMergePlan = {
	targetId: string;
	/** Non-target sentences that will be deleted and folded into the target. */
	deleteIds: string[];
	/** Non-target sentences that can't be folded away, with the reason. */
	skipped: MergeSkip[];
	/** Sentences whose word links should be unioned onto the target. */
	wordLinkSourceIds: string[];
	/** A deleted sentence whose single LessonWord must be repointed to the target. */
	lessonRepointId: string | null;
	targetUpdate: {
		english: string;
		notes: string | null;
		audioSourceId: string | null;
		imageSourceId: string | null;
	};
};

export class SentenceMergeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SentenceMergeError';
	}
}

function normalizeNotes(value: string | null): string | null {
	if (value == null) return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function planSentenceMerge(
	sentences: MergeSentence[],
	choices: MergeChoices
): SentenceMergePlan {
	if (sentences.length < 2) {
		throw new SentenceMergeError('Need at least two sentences to merge.');
	}

	const key = sentences[0].normalizedKey;
	if (sentences.some((s) => s.normalizedKey !== key)) {
		throw new SentenceMergeError('Sentences are not in the same duplicate group.');
	}

	const byId = new Map(sentences.map((s) => [s.id, s]));
	const target = byId.get(choices.targetId);
	if (!target) {
		throw new SentenceMergeError('Merge target is not in the group.');
	}

	if (choices.audioSourceId != null && !byId.has(choices.audioSourceId)) {
		throw new SentenceMergeError('Audio source is not in the group.');
	}
	if (choices.imageSourceId != null && !byId.has(choices.imageSourceId)) {
		throw new SentenceMergeError('Image source is not in the group.');
	}

	const skipped: MergeSkip[] = [];
	const deleteIds: string[] = [];
	let lessonRepointId: string | null = null;
	let targetHasLesson = target.hasLessonWord;

	for (const s of sentences) {
		if (s.id === target.id) continue;

		if (s.storySourced) {
			skipped.push({ id: s.id, reason: 'story' });
			continue;
		}

		if (s.hasLessonWord) {
			if (!targetHasLesson && lessonRepointId === null) {
				// The target has no lesson link, so we can move this one's over.
				lessonRepointId = s.id;
				targetHasLesson = true;
				deleteIds.push(s.id);
			} else {
				// LessonWord.sentenceId is unique + Restrict: a second lesson link
				// can't move to the target, and deleting would orphan the lesson.
				skipped.push({ id: s.id, reason: 'lesson-conflict' });
			}
			continue;
		}

		deleteIds.push(s.id);
	}

	return {
		targetId: target.id,
		deleteIds,
		skipped,
		wordLinkSourceIds: deleteIds,
		lessonRepointId,
		targetUpdate: {
			english: choices.english.trim(),
			notes: normalizeNotes(choices.notes),
			audioSourceId: choices.audioSourceId,
			imageSourceId: choices.imageSourceId
		}
	};
}
