import { describe, expect, it } from 'vitest';
import {
	planSentenceMerge,
	SentenceMergeError,
	type MergeChoices,
	type MergeSentence
} from './example-sentence-merge';

function sentence(overrides: Partial<MergeSentence> & { id: string }): MergeSentence {
	return {
		normalizedKey: 'amu',
		storySourced: false,
		hasLessonWord: false,
		english: '',
		notes: null,
		audioUrl: null,
		imageUrl: null,
		...overrides
	};
}

function choices(overrides: Partial<MergeChoices> & { targetId: string }): MergeChoices {
	return {
		english: 'because',
		notes: null,
		audioSourceId: null,
		imageSourceId: null,
		...overrides
	};
}

describe('planSentenceMerge', () => {
	it('folds plain duplicates into the chosen target', () => {
		const plan = planSentenceMerge(
			[sentence({ id: 'a' }), sentence({ id: 'b' }), sentence({ id: 'c' })],
			choices({ targetId: 'b' })
		);

		expect(plan.targetId).toBe('b');
		expect(plan.deleteIds.sort()).toEqual(['a', 'c']);
		expect(plan.wordLinkSourceIds.sort()).toEqual(['a', 'c']);
		expect(plan.skipped).toEqual([]);
		expect(plan.lessonRepointId).toBeNull();
	});

	it('trims english and normalizes blank notes to null', () => {
		const plan = planSentenceMerge(
			[sentence({ id: 'a' }), sentence({ id: 'b' })],
			choices({ targetId: 'a', english: '  because  ', notes: '   ' })
		);
		expect(plan.targetUpdate.english).toBe('because');
		expect(plan.targetUpdate.notes).toBeNull();
	});

	it('keeps notes when provided', () => {
		const plan = planSentenceMerge(
			[sentence({ id: 'a' }), sentence({ id: 'b' })],
			choices({ targetId: 'a', notes: '  see also X ' })
		);
		expect(plan.targetUpdate.notes).toBe('see also X');
	});

	it('skips story-sourced duplicates instead of deleting them', () => {
		const plan = planSentenceMerge(
			[sentence({ id: 'a' }), sentence({ id: 'b', storySourced: true })],
			choices({ targetId: 'a' })
		);
		expect(plan.deleteIds).toEqual([]);
		expect(plan.skipped).toEqual([{ id: 'b', reason: 'story' }]);
	});

	it('repoints one lesson link to the target when the target has none', () => {
		const plan = planSentenceMerge(
			[sentence({ id: 'a' }), sentence({ id: 'b', hasLessonWord: true })],
			choices({ targetId: 'a' })
		);
		expect(plan.lessonRepointId).toBe('b');
		expect(plan.deleteIds).toEqual(['b']);
		expect(plan.skipped).toEqual([]);
	});

	it('skips a second lesson-linked duplicate (unique sentenceId conflict)', () => {
		const plan = planSentenceMerge(
			[
				sentence({ id: 'a' }),
				sentence({ id: 'b', hasLessonWord: true }),
				sentence({ id: 'c', hasLessonWord: true })
			],
			choices({ targetId: 'a' })
		);
		expect(plan.lessonRepointId).toBe('b');
		expect(plan.deleteIds).toEqual(['b']);
		expect(plan.skipped).toEqual([{ id: 'c', reason: 'lesson-conflict' }]);
	});

	it('cannot move a lesson link when the target already has one', () => {
		const plan = planSentenceMerge(
			[
				sentence({ id: 'a', hasLessonWord: true }),
				sentence({ id: 'b', hasLessonWord: true })
			],
			choices({ targetId: 'a' })
		);
		expect(plan.lessonRepointId).toBeNull();
		expect(plan.deleteIds).toEqual([]);
		expect(plan.skipped).toEqual([{ id: 'b', reason: 'lesson-conflict' }]);
	});

	it('still allows a lesson-linked target to absorb plain duplicates', () => {
		const plan = planSentenceMerge(
			[
				sentence({ id: 'a', hasLessonWord: true }),
				sentence({ id: 'b' }),
				sentence({ id: 'c' })
			],
			choices({ targetId: 'a' })
		);
		expect(plan.deleteIds.sort()).toEqual(['b', 'c']);
		expect(plan.skipped).toEqual([]);
	});

	it('carries the chosen audio and image source ids through', () => {
		const plan = planSentenceMerge(
			[sentence({ id: 'a' }), sentence({ id: 'b', audioUrl: '/a.webm', imageUrl: '/i.jpg' })],
			choices({ targetId: 'a', audioSourceId: 'b', imageSourceId: 'b' })
		);
		expect(plan.targetUpdate.audioSourceId).toBe('b');
		expect(plan.targetUpdate.imageSourceId).toBe('b');
	});

	it('rejects fewer than two sentences', () => {
		expect(() => planSentenceMerge([sentence({ id: 'a' })], choices({ targetId: 'a' }))).toThrow(
			SentenceMergeError
		);
	});

	it('rejects sentences from different groups', () => {
		expect(() =>
			planSentenceMerge(
				[sentence({ id: 'a' }), sentence({ id: 'b', normalizedKey: 'other' })],
				choices({ targetId: 'a' })
			)
		).toThrow(/same duplicate group/);
	});

	it('rejects a target that is not in the group', () => {
		expect(() =>
			planSentenceMerge(
				[sentence({ id: 'a' }), sentence({ id: 'b' })],
				choices({ targetId: 'zzz' })
			)
		).toThrow(/Merge target/);
	});

	it('rejects an audio/image source outside the group', () => {
		expect(() =>
			planSentenceMerge(
				[sentence({ id: 'a' }), sentence({ id: 'b' })],
				choices({ targetId: 'a', audioSourceId: 'nope' })
			)
		).toThrow(/Audio source/);
		expect(() =>
			planSentenceMerge(
				[sentence({ id: 'a' }), sentence({ id: 'b' })],
				choices({ targetId: 'a', imageSourceId: 'nope' })
			)
		).toThrow(/Image source/);
	});
});
