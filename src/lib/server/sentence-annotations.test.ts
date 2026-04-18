import { describe, expect, it } from 'vitest';
import { buildSyncedTokenRows } from './sentence-annotations';

const parentIds = { exampleSentenceId: 'sentence-1' };

describe('buildSyncedTokenRows', () => {
	it('creates plain token rows when there are no existing annotations', () => {
		const rows = buildSyncedTokenRows(
			parentIds,
			[
				{ tokenOrder: 0, surfaceForm: 'Oh', normalizedForm: 'oh' },
				{ tokenOrder: 1, surfaceForm: 'eh', normalizedForm: 'eh' }
			],
			[]
		);

		expect(rows).toEqual([
			{
				exampleSentenceId: 'sentence-1',
				tokenOrder: 0,
				surfaceForm: 'Oh',
				normalizedForm: 'oh'
			},
			{
				exampleSentenceId: 'sentence-1',
				tokenOrder: 1,
				surfaceForm: 'eh',
				normalizedForm: 'eh'
			}
		]);
	});

	it('preserves annotations by same token order and normalized form first', () => {
		const rows = buildSyncedTokenRows(
			parentIds,
			[{ tokenOrder: 0, surfaceForm: 'Oh', normalizedForm: 'oh' }],
			[
				{
					tokenOrder: 0,
					surfaceForm: 'Oh',
					normalizedForm: 'oh',
					wordId: 'word-order',
					inContextTranslation: 'hello',
					word: { kalenjinNormalized: 'oh' }
				},
				{
					tokenOrder: 1,
					surfaceForm: 'Oh',
					normalizedForm: 'oh',
					wordId: 'word-surface',
					inContextTranslation: 'there',
					word: { kalenjinNormalized: 'oh' }
				}
			]
		);

		expect(rows[0]).toMatchObject({
			wordId: 'word-order',
			inContextTranslation: 'hello'
		});
	});

	it('preserves annotations by same normalized form when word order shifts', () => {
		const rows = buildSyncedTokenRows(
			parentIds,
			[
				{ tokenOrder: 0, surfaceForm: 'Arap', normalizedForm: 'arap' },
				{ tokenOrder: 1, surfaceForm: 'Oh', normalizedForm: 'oh' }
			],
			[
				{
					tokenOrder: 0,
					surfaceForm: 'Oh',
					normalizedForm: 'oh',
					wordId: 'word-oh',
					inContextTranslation: 'hello',
					word: { kalenjinNormalized: 'oh' }
				}
			]
		);

		expect(rows[1]).toMatchObject({
			wordId: 'word-oh',
			inContextTranslation: 'hello'
		});
		expect(rows[0]).not.toHaveProperty('wordId');
	});

	it('preserves an old unsplit token when its lemma matches a regenerated word', () => {
		const rows = buildSyncedTokenRows(
			parentIds,
			[
				{ tokenOrder: 0, surfaceForm: 'Oh', normalizedForm: 'oh' },
				{ tokenOrder: 1, surfaceForm: 'eh', normalizedForm: 'eh' }
			],
			[
				{
					tokenOrder: 0,
					surfaceForm: 'Oh eh',
					normalizedForm: 'oh eh',
					wordId: 'word-oh',
					inContextTranslation: 'hello',
					word: { kalenjinNormalized: 'oh' }
				}
			]
		);

		expect(rows[0]).toMatchObject({
			wordId: 'word-oh',
			inContextTranslation: 'hello'
		});
		expect(rows[1]).not.toHaveProperty('wordId');
	});

	it('prefers an exact surface match over a phrase lemma fallback', () => {
		const rows = buildSyncedTokenRows(
			parentIds,
			[{ tokenOrder: 0, surfaceForm: "koit'a", normalizedForm: "koit'a" }],
			[
				{
					tokenOrder: 0,
					surfaceForm: "koit'a baringo",
					normalizedForm: "koit'a baringo",
					wordId: 'word-phrase',
					inContextTranslation: 'phrase meaning',
					word: { kalenjinNormalized: "koit'a" }
				},
				{
					tokenOrder: 1,
					surfaceForm: "koit'a",
					normalizedForm: "koit'a",
					wordId: 'word-exact',
					inContextTranslation: 'exact meaning',
					word: { kalenjinNormalized: "koit'a" }
				}
			]
		);

		expect(rows[0]).toMatchObject({
			wordId: 'word-exact',
			inContextTranslation: 'exact meaning'
		});
	});

	it('preserves in-context meanings even when a token has no linked lemma', () => {
		const rows = buildSyncedTokenRows(
			parentIds,
			[{ tokenOrder: 0, surfaceForm: 'Oh', normalizedForm: 'oh' }],
			[
				{
					tokenOrder: 0,
					surfaceForm: 'Oh',
					normalizedForm: 'oh',
					wordId: null,
					inContextTranslation: 'hello',
					word: null
				}
			]
		);

		expect(rows[0]).toMatchObject({
			inContextTranslation: 'hello'
		});
		expect(rows[0]).not.toHaveProperty('wordId');
	});
});
