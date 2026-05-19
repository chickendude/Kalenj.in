import { describe, expect, it } from 'vitest';
import { lemmaScore, pickDefaultMergeTarget } from './duplicate-merge-default';

type Tok = { word: unknown | null; inContextTranslation: string | null; segments: { word: unknown | null }[] };

function tok(opts: Partial<Tok> = {}): Tok {
	return { word: null, inContextTranslation: null, segments: [], ...opts };
}

function sentence(overrides: {
	id: string;
	story?: boolean;
	lessons?: number;
	tokens?: Tok[];
}) {
	return {
		id: overrides.id,
		storySentence: overrides.story ? {} : null,
		lessonWords: Array.from({ length: overrides.lessons ?? 0 }, () => ({})),
		tokens: overrides.tokens ?? []
	};
}

describe('lemmaScore', () => {
	it('counts token-level lemma + context translation', () => {
		const s = sentence({
			id: 'a',
			tokens: [tok({ word: { kalenjin: 'x' }, inContextTranslation: 'the' }), tok()]
		});
		expect(lemmaScore(s)).toBe(2);
	});

	it('credits a segment-level lemma when the token has none', () => {
		const s = sentence({ id: 'a', tokens: [tok({ segments: [{ word: { kalenjin: 'y' } }] })] });
		expect(lemmaScore(s)).toBe(1);
	});

	it('ignores blank in-context translations', () => {
		const s = sentence({ id: 'a', tokens: [tok({ inContextTranslation: '   ' })] });
		expect(lemmaScore(s)).toBe(0);
	});
});

describe('pickDefaultMergeTarget', () => {
	it('picks the most complete copy when no lesson/story is involved', () => {
		const sparse = sentence({ id: 'sparse', tokens: [tok(), tok()] });
		const rich = sentence({
			id: 'rich',
			tokens: [tok({ word: {}, inContextTranslation: 'a' }), tok({ word: {} })]
		});
		expect(pickDefaultMergeTarget([sparse, rich]).id).toBe('rich');
	});

	it('keeps ties on the earliest sentence (stable)', () => {
		const a = sentence({ id: 'a', tokens: [tok({ word: {} })] });
		const b = sentence({ id: 'b', tokens: [tok({ word: {} })] });
		expect(pickDefaultMergeTarget([a, b]).id).toBe('a');
	});

	it('does NOT auto-pick the richest when a lesson copy exists (safe fallback)', () => {
		const lessonCopy = sentence({ id: 'lesson', lessons: 1, tokens: [tok()] });
		const rich = sentence({
			id: 'rich',
			tokens: [tok({ word: {}, inContextTranslation: 'a' })]
		});
		// falls back to first non-story (lesson copy is non-story), not the rich one
		expect(pickDefaultMergeTarget([lessonCopy, rich]).id).toBe('lesson');
	});

	it('does NOT auto-pick the richest when a story copy exists; prefers non-story', () => {
		const storyCopy = sentence({ id: 'story', story: true, tokens: [tok({ word: {} })] });
		const plain = sentence({ id: 'plain', tokens: [tok()] });
		expect(pickDefaultMergeTarget([storyCopy, plain]).id).toBe('plain');
	});

	it('falls back to the first when every copy is story-owned', () => {
		const s1 = sentence({ id: 's1', story: true });
		const s2 = sentence({ id: 's2', story: true });
		expect(pickDefaultMergeTarget([s1, s2]).id).toBe('s1');
	});

	it('throws on an empty group', () => {
		expect(() => pickDefaultMergeTarget([])).toThrow();
	});
});
