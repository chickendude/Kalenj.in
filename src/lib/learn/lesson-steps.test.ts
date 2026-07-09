import { describe, expect, it } from 'vitest';
import {
	acceptableAnswers,
	buildLessonSteps,
	clampStepIndex,
	normalizeAnswerChar,
	normalizeAnswerText,
	normalizeTypedAnswer,
	resolveBlanks,
	typeableText,
	type LearnLesson,
	type LearnLessonWord,
	type LearnToken
} from './lesson-steps';

function token(overrides: Partial<LearnToken> & { tokenOrder: number; surfaceForm: string }): LearnToken {
	return {
		id: `tok-${overrides.tokenOrder}`,
		normalizedForm: overrides.surfaceForm.toLowerCase(),
		wordId: null,
		...overrides
	};
}

function lessonWord(overrides: Partial<LearnLessonWord> & { id: string }): LearnLessonWord {
	return {
		wordId: null,
		kalenjin: 'chego',
		translations: 'milk',
		...overrides
	};
}

describe('normalizeAnswerText', () => {
	it('lowercases, trims, and strips edge punctuation', () => {
		expect(normalizeAnswerText('  Chego!  ')).toBe('chego');
	});

	it('folds apostrophe variants', () => {
		expect(normalizeAnswerText('ng’o')).toBe(normalizeAnswerText("ng'o"));
	});

	it('collapses internal whitespace', () => {
		expect(normalizeAnswerText('ma   olen')).toBe('ma olen');
	});
});

describe('typeableText', () => {
	it('keeps letters, digits, and apostrophes; drops other punctuation', () => {
		expect(typeableText("lang'at")).toBe("lang'at");
		expect(typeableText('Chamgei!')).toBe('Chamgei');
		expect(typeableText('Ma olen nõus.')).toBe('Maolennõus');
	});
});

describe('normalizeAnswerChar', () => {
	it('folds case and apostrophe variants', () => {
		expect(normalizeAnswerChar('A')).toBe('a');
		expect(normalizeAnswerChar('’')).toBe("'");
	});

	it('folds the a/o spelling alternation', () => {
		expect(normalizeAnswerChar('o')).toBe('a');
		expect(normalizeAnswerChar('O')).toBe('a');
	});
});

describe('acceptableAnswers', () => {
	const word = {
		id: 'w1',
		kalenjin: 'amitwok',
		translations: 'food',
		spellings: [{ spelling: 'omitwok' }],
		observedForms: [
			{ normalizedForm: 'amitwogik' },
			{ normalizedForm: 'omitwogik' },
			{ normalizedForm: 'amitwok' }
		]
	};

	it('accepts close same-length spelling variants', () => {
		const accepted = acceptableAnswers({ kalenjin: 'amitwogik', word }, 'amitwogik');
		expect(accepted.has(normalizeTypedAnswer('amitwogik'))).toBe(true);
		expect(accepted.has(normalizeTypedAnswer('omitwogik'))).toBe(true);
	});

	it('rejects different-length inflections of the same lemma', () => {
		const accepted = acceptableAnswers({ kalenjin: 'amitwogik', word }, 'amitwogik');
		expect(accepted.has(normalizeTypedAnswer('amitwok'))).toBe(false);
	});

	it('is case- and apostrophe-insensitive', () => {
		const accepted = acceptableAnswers({ kalenjin: 'Chamgei', word: null }, 'Chamgei');
		expect(accepted.has(normalizeTypedAnswer('chamgei'))).toBe(true);
	});

	it('treats apostrophes as typed but optional', () => {
		const accepted = acceptableAnswers({ kalenjin: "lang'at", word: null }, "lang'at");
		expect(accepted.has(normalizeTypedAnswer("lang'at"))).toBe(true);
		expect(accepted.has(normalizeTypedAnswer('langat'))).toBe(true);
		// Curly apostrophes from smart keyboards normalize to straight ones.
		expect(accepted.has(normalizeTypedAnswer('lang’at'))).toBe(true);
	});

	it('accepts a/o alternations anywhere in the target, even unrecorded ones', () => {
		// Dictation over a whole sentence: the word-level variant list can't
		// cover it, so the fold in normalizeAnswerChar has to.
		const accepted = acceptableAnswers({ kalenjin: 'onyiny', word: null }, 'Onyiny amitwogik');
		expect(accepted.has(normalizeTypedAnswer('Anyiny amitwogik'))).toBe(true);
		expect(accepted.has(normalizeTypedAnswer('Onyiny omitwogik'))).toBe(true);
		expect(accepted.has(normalizeTypedAnswer('Anyinu amitwogik'))).toBe(false);
	});

	it('caps substitutions for short words at one', () => {
		const shortWord = {
			id: 'w2',
			kalenjin: 'kot',
			translations: 'very',
			observedForms: [{ normalizedForm: 'kop' }, { normalizedForm: 'bip' }]
		};
		const accepted = acceptableAnswers({ kalenjin: 'kot', word: shortWord }, 'kot');
		expect(accepted.has(normalizeTypedAnswer('kop'))).toBe(true); // 1 substitution
		expect(accepted.has(normalizeTypedAnswer('bip'))).toBe(false); // 2 substitutions
	});
});

describe('resolveBlanks', () => {
	it('matches tokens linked to the dictionary word', () => {
		const tokens = [
			token({ tokenOrder: 1, surfaceForm: 'Ma' }),
			token({ tokenOrder: 2, surfaceForm: 'olen', wordId: 'w-olen' }),
			token({ tokenOrder: 3, surfaceForm: 'nõus' })
		];
		const result = resolveBlanks({ wordId: 'w-olen', kalenjin: 'olema' }, tokens);
		expect(result).toEqual({ kind: 'sentence', blankTokenOrders: [2], target: 'olen' });
	});

	it('matches via segment word links', () => {
		const tokens = [
			token({
				tokenOrder: 1,
				surfaceForm: 'Kiamache',
				segments: [{ id: 's1', surfaceForm: 'mache', wordId: 'w-mache' }]
			}),
			token({ tokenOrder: 2, surfaceForm: 'chego' })
		];
		const result = resolveBlanks({ wordId: 'w-mache', kalenjin: 'mache' }, tokens);
		expect(result).toEqual({ kind: 'sentence', blankTokenOrders: [1], target: 'Kiamache' });
	});

	it('blanks every token linked to the word, in order', () => {
		const tokens = [
			token({ tokenOrder: 2, surfaceForm: 'eelistan', wordId: 'w-eelistama' }),
			token({ tokenOrder: 1, surfaceForm: 'Ma', wordId: 'w-eelistama' }),
			token({ tokenOrder: 3, surfaceForm: 'rohelist' })
		];
		const result = resolveBlanks({ wordId: 'w-eelistama', kalenjin: 'ma eelistan' }, tokens);
		expect(result).toEqual({
			kind: 'sentence',
			blankTokenOrders: [1, 2],
			target: 'Ma eelistan'
		});
	});

	it('falls back to a contiguous normalized surface match for multi-word answers', () => {
		const tokens = [
			token({ tokenOrder: 1, surfaceForm: 'Ma' }),
			token({ tokenOrder: 2, surfaceForm: 'olen' }),
			token({ tokenOrder: 3, surfaceForm: 'nõus' })
		];
		const result = resolveBlanks({ wordId: null, kalenjin: 'Ma olen' }, tokens);
		expect(result).toEqual({
			kind: 'sentence',
			blankTokenOrders: [1, 2],
			target: 'Ma olen'
		});
	});

	it('degrades to word-only when nothing matches', () => {
		const tokens = [token({ tokenOrder: 1, surfaceForm: 'Kainet' })];
		const result = resolveBlanks({ wordId: 'w-x', kalenjin: 'chego' }, tokens);
		expect(result).toEqual({ kind: 'wordOnly', target: 'chego' });
	});

	it('degrades to word-only without tokens', () => {
		expect(resolveBlanks({ wordId: null, kalenjin: 'chego' }, undefined)).toEqual({
			kind: 'wordOnly',
			target: 'chego'
		});
	});
});

describe('buildLessonSteps', () => {
	const w1 = lessonWord({
		id: 'lw1',
		kalenjin: 'chego',
		sentence: {
			id: 'sent1',
			kalenjin: 'Amache chego.',
			english: 'I want milk.',
			tokens: [
				token({ tokenOrder: 1, surfaceForm: 'Amache' }),
				token({ tokenOrder: 2, surfaceForm: 'chego' })
			]
		}
	});
	const w2 = lessonWord({
		id: 'lw2',
		kalenjin: 'beek',
		sentence: {
			id: 'sent2',
			kalenjin: 'Amache beek.',
			english: 'I want water.',
			tokens: [
				token({ tokenOrder: 1, surfaceForm: 'Amache' }),
				token({ tokenOrder: 2, surfaceForm: 'beek' })
			]
		}
	});
	const w3 = lessonWord({ id: 'lw3', kalenjin: 'kot', sentence: null });

	function stepKey(step: ReturnType<typeof buildLessonSteps>[number]): string {
		if (step.kind === 'wordIntro') return `intro:${step.lessonWord.id}`;
		if (step.kind === 'recall') return `${step.mode}:${step.lessonWord.id}`;
		return step.kind;
	}

	it('builds a vocabulary lesson with lag-1 recall interleaving', () => {
		const lesson: LearnLesson = {
			id: 'l1',
			title: 'Basics',
			type: 'VOCABULARY',
			grammarMarkdown: '# Notes',
			sections: [{ id: 'sec1', title: 'Food', words: [w1, w2, w3] }]
		};
		// No sentence audio → no dictation drills.
		const kinds = buildLessonSteps(lesson).map(stepKey);
		expect(kinds).toEqual([
			'grammar',
			'section',
			'intro:lw1',
			'intro:lw2',
			'text:lw1',
			'intro:lw3', // lw3 has no sentence → no recall step
			'text:lw2',
			'complete'
		]);
	});

	it('adds lag-2 audio dictation drills when sentence audio exists', () => {
		const withAudio = (word: typeof w1, id: string) => ({
			...word,
			id,
			sentence: { ...word.sentence!, audioUrl: '/audio/x.mp3' }
		});
		const a = withAudio(w1, 'a');
		const b = withAudio(w2, 'b');
		const lesson: LearnLesson = {
			id: 'l1',
			title: 'Basics',
			type: 'VOCABULARY',
			sections: [{ id: 'sec1', title: null, words: [a, b] }]
		};
		const kinds = buildLessonSteps(lesson).map(stepKey);
		expect(kinds).toEqual([
			'intro:a',
			'intro:b',
			'text:a',
			'text:b',
			'audio:a',
			'audio:b',
			'complete'
		]);
	});

	it('skips the grammar step when there is no markdown', () => {
		const lesson: LearnLesson = {
			id: 'l1',
			title: 'Basics',
			type: 'VOCABULARY',
			grammarMarkdown: '  ',
			sections: [{ id: 'sec1', title: null, words: [w3] }]
		};
		const kinds = buildLessonSteps(lesson).map((step) => step.kind);
		expect(kinds).toEqual(['wordIntro', 'complete']);
	});

	it('builds a story lesson ordered by sentenceOrder', () => {
		const lesson: LearnLesson = {
			id: 'l2',
			title: 'Story time',
			type: 'STORY',
			sections: [],
			story: {
				title: 'The market',
				description: 'A trip to the market.',
				source: null,
				sentences: [
					{
						id: 'ss2',
						sentenceOrder: 2,
						exampleSentence: { id: 'sent2', kalenjin: 'B', english: 'B', tokens: [] }
					},
					{
						id: 'ss1',
						sentenceOrder: 1,
						exampleSentence: { id: 'sent1', kalenjin: 'A', english: 'A', tokens: [] }
					}
				]
			}
		};
		const steps = buildLessonSteps(lesson);
		expect(steps[0]).toEqual({
			kind: 'storyIntro',
			title: 'The market',
			description: 'A trip to the market.',
			source: null
		});
		expect(
			steps
				.filter((step) => step.kind === 'storySentence')
				.map((step) => step.storySentence.id)
		).toEqual(['ss1', 'ss2']);
		expect(steps.at(-1)).toEqual({ kind: 'complete' });
	});
});

describe('clampStepIndex', () => {
	it('clamps into range and floors fractions', () => {
		expect(clampStepIndex(5, 10)).toBe(5);
		expect(clampStepIndex(42, 10)).toBe(9);
		expect(clampStepIndex(-1, 10)).toBe(0);
		expect(clampStepIndex(2.7, 10)).toBe(2);
		expect(clampStepIndex(Number.NaN, 10)).toBe(0);
		expect(clampStepIndex(3, 0)).toBe(0);
	});
});
