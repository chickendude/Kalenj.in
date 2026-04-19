import { describe, expect, it } from 'vitest';
import {
	orderedEditableWords,
	planTokenLexicalSegments,
	planMergeTokenGroups,
	planSplitTokenGroup,
	planUpdateTokenGroupSurface,
	type EditableToken
} from './token-group-edit';

const TOKENS: EditableToken[] = [
	{ id: 'a', tokenOrder: 0, surfaceForm: 'Oh' },
	{ id: 'b', tokenOrder: 1, surfaceForm: 'eh' },
	{ id: 'c', tokenOrder: 2, surfaceForm: 'kararan' }
];

describe('orderedEditableWords', () => {
	it('returns each token as one editable word in sentence order', () => {
		expect(
			orderedEditableWords([
				{ id: 'b', tokenOrder: 1, surfaceForm: 'eh' },
				{ id: 'a', tokenOrder: 0, surfaceForm: 'Oh' }
			])
		).toEqual([
			{ token: { id: 'a', tokenOrder: 0, surfaceForm: 'Oh' }, fullSurface: 'Oh' },
			{ token: { id: 'b', tokenOrder: 1, surfaceForm: 'eh' }, fullSurface: 'eh' }
		]);
	});
});

describe('planMergeTokenGroups', () => {
	it('merges adjacent words into the left token surface', () => {
		expect(planMergeTokenGroups(TOKENS, 'a', 'b')).toEqual({
			keepTokenId: 'a',
			removeTokenId: 'b',
			removedTokenOrder: 1,
			surfaceForm: 'Oh eh',
			normalizedForm: 'oh eh',
			wordId: null,
			inContextTranslation: null
		});
	});

	it('combines meanings left-to-right when merging adjacent words', () => {
		expect(
			planMergeTokenGroups(
				[
					{
						id: 'a',
						tokenOrder: 0,
						surfaceForm: 'Oh',
						inContextTranslation: 'wow'
					},
					{
						id: 'b',
						tokenOrder: 1,
						surfaceForm: 'eh',
						inContextTranslation: 'hey'
					}
				],
				'b',
				'a'
			)
		).toMatchObject({
			keepTokenId: 'a',
			removeTokenId: 'b',
			surfaceForm: 'Oh eh',
			inContextTranslation: 'wow hey'
		});
	});

	it('preserves the first available linked lemma when merging', () => {
		expect(
			planMergeTokenGroups(
				[
					{ id: 'a', tokenOrder: 0, surfaceForm: 'Oh', wordId: null },
					{ id: 'b', tokenOrder: 1, surfaceForm: 'eh', wordId: 'word-b' }
				],
				'a',
				'b'
			)
		).toMatchObject({
			wordId: 'word-b'
		});
	});

	it('rejects non-adjacent merges', () => {
		expect(() => planMergeTokenGroups(TOKENS, 'a', 'c')).toThrow('Only adjacent words can be combined.');
	});
});

describe('planSplitTokenGroup', () => {
	it('splits a word with spaces into ordered parts', () => {
		expect(
			planSplitTokenGroup(
				[
					{
						id: 'a',
						tokenOrder: 0,
						surfaceForm: 'Oh eh',
						inContextTranslation: 'wow hey'
					},
					{ id: 'b', tokenOrder: 1, surfaceForm: 'kararan' }
				],
				'a'
			)
		).toEqual({
			tokenId: 'a',
			tokenOrder: 0,
			parts: [
				{ surfaceForm: 'Oh', normalizedForm: 'oh', inContextTranslation: 'wow' },
				{ surfaceForm: 'eh', normalizedForm: 'eh', inContextTranslation: 'hey' }
			]
		});
	});

	it('keeps the full meaning on the first split part when meanings cannot split evenly', () => {
		expect(
			planSplitTokenGroup(
				[{ id: 'a', tokenOrder: 0, surfaceForm: 'thank you', inContextTranslation: 'thanks' }],
				'a'
			).parts
		).toEqual([
			{ surfaceForm: 'thank', normalizedForm: 'thank', inContextTranslation: 'thanks' },
			{ surfaceForm: 'you', normalizedForm: 'you', inContextTranslation: null }
		]);
	});

	it('rejects splitting words that do not contain spaces', () => {
		expect(() => planSplitTokenGroup(TOKENS, 'a')).toThrow('Only words with spaces can be split.');
	});
});

describe('planTokenLexicalSegments', () => {
	it('marks lexical segments within a single written word', () => {
		expect(
			planTokenLexicalSegments(
				[{ id: 'a', tokenOrder: 0, surfaceForm: 'Kotab', wordId: 'word-kotab' }],
				'a',
				[3]
			)
		).toEqual([
			{
				segmentOrder: 0,
				segmentStart: 0,
				segmentEnd: 3,
				surfaceForm: 'Kot',
				normalizedForm: 'kot',
				wordId: null
			},
			{
				segmentOrder: 1,
				segmentStart: 3,
				segmentEnd: 5,
				surfaceForm: 'ab',
				normalizedForm: 'ab',
				wordId: null
			}
		]);
	});

	it('requires at least one split point for lexical segments', () => {
		expect(() => planTokenLexicalSegments(TOKENS, 'a', [])).toThrow(
			'Choose at least one split point in "Oh".'
		);
	});

	it('rejects lexical segment points outside the written word', () => {
		expect(() => planTokenLexicalSegments(TOKENS, 'a', [2])).toThrow(
			'Split points must be between 1 and 1.'
		);
	});
});

describe('planUpdateTokenGroupSurface', () => {
	it('updates one editable word and allows spaces', () => {
		expect(planUpdateTokenGroupSurface(TOKENS, 'a', 'oh   eeh')).toEqual({
			id: 'a',
			surfaceForm: 'oh eeh',
			normalizedForm: 'oh eeh'
		});
	});

	it('rejects empty word text', () => {
		expect(() => planUpdateTokenGroupSurface(TOKENS, 'a', '   ')).toThrow('Word text is required.');
	});
});
