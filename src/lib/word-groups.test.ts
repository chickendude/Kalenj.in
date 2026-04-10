import { describe, expect, it } from 'vitest';
import { groupSentenceTokens } from './word-groups';

type TestToken = {
	id: string;
	tokenOrder: number;
	surfaceForm: string;
};

describe('groupSentenceTokens', () => {
	it('groups multiple token segments back into each sentence word', () => {
		const tokens: TestToken[] = [
			{ id: 'a', tokenOrder: 0, surfaceForm: 'Chep' },
			{ id: 'b', tokenOrder: 1, surfaceForm: 'too' },
			{ id: 'c', tokenOrder: 2, surfaceForm: 'koi' },
			{ id: 'd', tokenOrder: 3, surfaceForm: 't' }
		];

		expect(
			groupSentenceTokens({
				sentenceId: 'sentence-1',
				sentenceText: 'Cheptoo koit',
				tokens
			})
		).toEqual([
			{
				key: 'sentence-1:0:a:b',
				wordIndex: 0,
				fullSurface: 'Cheptoo',
				tokens: [tokens[0], tokens[1]]
			},
			{
				key: 'sentence-1:1:c:d',
				wordIndex: 1,
				fullSurface: 'koit',
				tokens: [tokens[2], tokens[3]]
			}
		]);
	});

	it('creates fallback groups for leftover tokens beyond the sentence words', () => {
		const tokens: TestToken[] = [
			{ id: 'a', tokenOrder: 0, surfaceForm: 'hello' },
			{ id: 'b', tokenOrder: 1, surfaceForm: 'extra' }
		];

		expect(
			groupSentenceTokens({
				sentenceId: 'sentence-2',
				sentenceText: 'hello',
				tokens
			})
		).toEqual([
			{
				key: 'sentence-2:0:a',
				wordIndex: 0,
				fullSurface: 'hello',
				tokens: [tokens[0]]
			},
			{
				key: 'sentence-2:1:b',
				wordIndex: 1,
				fullSurface: 'extra',
				tokens: [tokens[1]]
			}
		]);
	});

	it('falls back to token surfaces when the sentence text has no words', () => {
		const tokens: TestToken[] = [
			{ id: 'a', tokenOrder: 0, surfaceForm: 'alpha' },
			{ id: 'b', tokenOrder: 1, surfaceForm: 'beta' }
		];

		expect(
			groupSentenceTokens({
				sentenceId: 'sentence-3',
				sentenceText: '   ',
				tokens
			})
		).toEqual([
			{
				key: 'sentence-3:0:a',
				wordIndex: 0,
				fullSurface: 'alpha',
				tokens: [tokens[0]]
			},
			{
				key: 'sentence-3:1:b',
				wordIndex: 1,
				fullSurface: 'beta',
				tokens: [tokens[1]]
			}
		]);
	});
});
