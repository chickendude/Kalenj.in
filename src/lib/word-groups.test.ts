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
				tokens: [tokens[0]]
			},
			{
				key: 'sentence-1:b',
				fullSurface: 'kararan',
				tokens: [tokens[1]]
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
				tokens: [tokens[1]]
			},
			{
				key: 'sentence-2:b',
				fullSurface: 'beta',
				tokens: [tokens[0]]
			}
		]);
	});
});
