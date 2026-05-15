import { describe, expect, it } from 'vitest';
import { groupSentenceTokens } from './word-groups';

type TestToken = {
	id: string;
	tokenOrder: number;
	surfaceForm: string;
};

describe('groupSentenceTokens', () => {
	it('returns each editable token as one visible word', () => {
		const tokens: TestToken[] = [
			{ id: 'a', tokenOrder: 0, surfaceForm: 'Oh eh' },
			{ id: 'b', tokenOrder: 1, surfaceForm: 'kararan' }
		];

		expect(
			groupSentenceTokens({
				sentenceId: 'sentence-1',
				tokens
			})
		).toEqual([
			{
				key: 'sentence-1:a',
				fullSurface: 'Oh eh',
				tokens: [tokens[0]],
				breakBefore: false,
				speakerTurn: false
			},
			{
				key: 'sentence-1:b',
				fullSurface: 'kararan',
				tokens: [tokens[1]],
				breakBefore: false,
				speakerTurn: false
			}
		]);
	});

	it('sorts visible words by token order', () => {
		const tokens: TestToken[] = [
			{ id: 'b', tokenOrder: 1, surfaceForm: 'beta' },
			{ id: 'a', tokenOrder: 0, surfaceForm: 'alpha' }
		];

		expect(
			groupSentenceTokens({
				sentenceId: 'sentence-2',
				tokens
			})
		).toEqual([
			{
				key: 'sentence-2:a',
				fullSurface: 'alpha',
				tokens: [tokens[1]],
				breakBefore: false,
				speakerTurn: false
			},
			{
				key: 'sentence-2:b',
				fullSurface: 'beta',
				tokens: [tokens[0]],
				breakBefore: false,
				speakerTurn: false
			}
		]);
	});

	it('marks a break and speaker turns around a standalone "-"', () => {
		// "arje - nalaye": the dash is split index 1 and dropped by the
		// tokenizer, so the surviving tokens keep orders 0 and 2. Both turns
		// get a dialogue marker; only the reply starts a new line.
		const tokens: TestToken[] = [
			{ id: 'a', tokenOrder: 0, surfaceForm: 'arje' },
			{ id: 'b', tokenOrder: 2, surfaceForm: 'nalaye' }
		];

		expect(
			groupSentenceTokens({
				sentenceId: 's',
				tokens,
				sentenceText: 'arje - nalaye'
			})
		).toEqual([
			{
				key: 's:a',
				fullSurface: 'arje',
				tokens: [tokens[0]],
				breakBefore: false,
				speakerTurn: true
			},
			{
				key: 's:b',
				fullSurface: 'nalaye',
				tokens: [tokens[1]],
				breakBefore: true,
				speakerTurn: true
			}
		]);
	});

	it('does not break or mark turns when no sentence text is provided', () => {
		const tokens: TestToken[] = [
			{ id: 'a', tokenOrder: 0, surfaceForm: 'arje' },
			{ id: 'b', tokenOrder: 2, surfaceForm: 'nalaye' }
		];

		const groups = groupSentenceTokens({ sentenceId: 's', tokens });
		expect(groups.map((g) => g.breakBefore)).toEqual([false, false]);
		expect(groups.map((g) => g.speakerTurn)).toEqual([false, false]);
	});

	it('ignores hyphens that are part of a word', () => {
		const tokens: TestToken[] = [
			{ id: 'a', tokenOrder: 0, surfaceForm: 'ko-' },
			{ id: 'b', tokenOrder: 1, surfaceForm: 'lakwet' }
		];

		const groups = groupSentenceTokens({
			sentenceId: 's',
			tokens,
			sentenceText: 'ko- lakwet'
		});
		expect(groups.map((g) => g.breakBefore)).toEqual([false, false]);
		expect(groups.map((g) => g.speakerTurn)).toEqual([false, false]);
	});

	it('handles multiple speaker turns in one sentence', () => {
		// "arje - nalaye - kongoi": dashes at split indexes 1 and 3.
		const tokens: TestToken[] = [
			{ id: 'a', tokenOrder: 0, surfaceForm: 'arje' },
			{ id: 'b', tokenOrder: 2, surfaceForm: 'nalaye' },
			{ id: 'c', tokenOrder: 4, surfaceForm: 'kongoi' }
		];

		const groups = groupSentenceTokens({
			sentenceId: 's',
			tokens,
			sentenceText: 'arje - nalaye - kongoi'
		});
		expect(groups.map((g) => g.breakBefore)).toEqual([false, true, true]);
		expect(groups.map((g) => g.speakerTurn)).toEqual([true, true, true]);
	});

	it('marks the opening turn for a sentence that starts with "-" without a leading break', () => {
		const tokens: TestToken[] = [
			{ id: 'a', tokenOrder: 1, surfaceForm: 'arje' },
			{ id: 'b', tokenOrder: 2, surfaceForm: 'nalaye' }
		];

		const groups = groupSentenceTokens({
			sentenceId: 's',
			tokens,
			sentenceText: '- arje nalaye'
		});
		expect(groups.map((g) => g.breakBefore)).toEqual([false, false]);
		expect(groups.map((g) => g.speakerTurn)).toEqual([true, false]);
	});
});
