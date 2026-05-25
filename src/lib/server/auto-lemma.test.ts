import { describe, expect, it, vi } from 'vitest';
import {
	autoLemmatizeMissingExampleSentenceWords,
	buildAutoLemmaTokenPlans,
	loadAutoLemmaInContextTranslations,
	splitMarkedTokenSegments
} from '$lib/server/auto-lemma';

describe('splitMarkedTokenSegments', () => {
	it('splits pipe-marked surface forms into lexical segment ranges', () => {
		expect(splitMarkedTokenSegments('ne|nyun.')).toEqual([
			{
				segmentOrder: 0,
				segmentStart: 0,
				segmentEnd: 2,
				surfaceForm: 'ne',
				normalizedForm: 'ne'
			},
			{
				segmentOrder: 1,
				segmentStart: 3,
				segmentEnd: 8,
				surfaceForm: 'nyun.',
				normalizedForm: 'nyun'
			}
		]);
	});
});

describe('loadAutoLemmaInContextTranslations', () => {
	it('uses the most common prior context translation for a token lemma pair', async () => {
		const db = {
			exampleSentenceToken: {
				findMany: vi.fn().mockResolvedValue([
					{ normalizedForm: 'kaa', wordId: 'word-kaa', inContextTranslation: 'house' },
					{ normalizedForm: 'kaa', wordId: 'word-kaa', inContextTranslation: 'home' },
					{ normalizedForm: 'kaa', wordId: 'word-kaa', inContextTranslation: 'home' }
				])
			}
		};

		const result = await loadAutoLemmaInContextTranslations(db as never, [['kaa', 'word-kaa']]);

		expect(result.get('kaa\u0000word-kaa')).toBe('home');
		expect(db.exampleSentenceToken.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
			})
		);
	});

	it('uses the earliest prior context translation when counts tie', async () => {
		const db = {
			exampleSentenceToken: {
				findMany: vi.fn().mockResolvedValue([
					{ normalizedForm: 'kaa', wordId: 'word-kaa', inContextTranslation: 'house' },
					{ normalizedForm: 'kaa', wordId: 'word-kaa', inContextTranslation: 'home' }
				])
			}
		};

		const result = await loadAutoLemmaInContextTranslations(db as never, [['kaa', 'word-kaa']]);

		expect(result.get('kaa\u0000word-kaa')).toBe('house');
	});
});

describe('buildAutoLemmaTokenPlans', () => {
	it('auto-links missing token lemmas from observed form matches', () => {
		const result = buildAutoLemmaTokenPlans(
			[{ tokenOrder: 0, surfaceForm: 'Kaa.', normalizedForm: 'kaa' }],
			[],
			new Map([['kaa', 'word-kaa']])
		);

		expect(result.autoLinkedCount).toBe(1);
		expect(result.tokens[0]).toMatchObject({
			wordId: 'word-kaa',
			autoLinked: true
		});
	});

	it('prefills in-context translations for unambiguous auto-linked token lemmas', () => {
		const result = buildAutoLemmaTokenPlans(
			[{ tokenOrder: 0, surfaceForm: 'Kaa.', normalizedForm: 'kaa' }],
			[],
			new Map([['kaa', 'word-kaa']]),
			new Map(),
			new Map([['kaa\u0000word-kaa', 'home']])
		);

		expect(result.tokens[0]).toMatchObject({
			wordId: 'word-kaa',
			inContextTranslation: 'home',
			autoLinked: true
		});
	});

	it('keeps preserved manual links ahead of auto matches', () => {
		const result = buildAutoLemmaTokenPlans(
			[{ tokenOrder: 0, surfaceForm: 'Kaa.', normalizedForm: 'kaa' }],
			[
				{
					tokenOrder: 0,
					surfaceForm: 'Kaa.',
					normalizedForm: 'kaa',
					wordId: 'word-manual',
					inContextTranslation: 'home',
					word: { kalenjinNormalized: 'kaa' }
				}
			],
			new Map([['kaa', 'word-auto']])
		);

		expect(result.autoLinkedCount).toBe(0);
		expect(result.tokens[0]).toMatchObject({
			wordId: 'word-manual',
			inContextTranslation: 'home',
			autoLinked: false
		});
	});

	it('creates linked segment plans for pipe-marked words', () => {
		const result = buildAutoLemmaTokenPlans(
			[{ tokenOrder: 0, surfaceForm: 'ne|nyun', normalizedForm: 'ne|nyun' }],
			[],
			new Map([
				['ne', 'word-ne'],
				['nyun', 'word-nyun']
			])
		);

		expect(result.autoLinkedCount).toBe(2);
		expect(result.tokens[0]).toMatchObject({
			wordId: null,
			autoLinked: true,
			segments: [
				{ surfaceForm: 'ne', normalizedForm: 'ne', wordId: 'word-ne', autoLinked: true },
				{ surfaceForm: 'nyun', normalizedForm: 'nyun', wordId: 'word-nyun', autoLinked: true }
			]
		});
	});

	it('preserves a manual token-level link instead of replacing it with pipe segments', () => {
		const result = buildAutoLemmaTokenPlans(
			[{ tokenOrder: 0, surfaceForm: 'ne|nyun', normalizedForm: 'ne|nyun' }],
			[
				{
					tokenOrder: 0,
					surfaceForm: 'ne|nyun',
					normalizedForm: 'ne|nyun',
					wordId: 'word-manual',
					inContextTranslation: 'mine',
					word: { kalenjinNormalized: 'ne|nyun' }
				}
			],
			new Map([
				['ne', 'word-ne'],
				['nyun', 'word-nyun']
			])
		);

		expect(result.autoLinkedCount).toBe(0);
		expect(result.tokens[0]).toMatchObject({
			wordId: 'word-manual',
			inContextTranslation: 'mine',
			segments: [],
			autoLinked: false
		});
	});

	it('replays a known fused-token segmentation from prior split tokens', () => {
		const result = buildAutoLemmaTokenPlans(
			[{ tokenOrder: 0, surfaceForm: 'koneimwa.', normalizedForm: 'koneimwa' }],
			[],
			new Map(),
			new Map([
				[
					'koneimwa',
					[
						{ normalizedForm: 'kone', wordId: 'word-kone' },
						{ normalizedForm: 'i', wordId: 'word-i' },
						{ normalizedForm: 'mwa', wordId: 'word-mwa' }
					]
				]
			])
		);

		expect(result.autoLinkedCount).toBe(3);
		expect(result.tokens[0]).toMatchObject({
			wordId: null,
			autoLinked: true,
			segments: [
				{ surfaceForm: 'kone', normalizedForm: 'kone', wordId: 'word-kone', autoLinked: true },
				{ surfaceForm: 'i', normalizedForm: 'i', wordId: 'word-i', autoLinked: true },
				{ surfaceForm: 'mwa.', normalizedForm: 'mwa', wordId: 'word-mwa', autoLinked: true }
			]
		});
	});

	it('does not infer an unmarked fused-token split without a known segmentation', () => {
		const result = buildAutoLemmaTokenPlans(
			[{ tokenOrder: 0, surfaceForm: 'nenyun.', normalizedForm: 'nenyun' }],
			[],
			new Map([
				['ne', 'word-ne'],
				['nyun', 'word-nyun']
			])
		);

		expect(result.autoLinkedCount).toBe(0);
		expect(result.tokens[0]).toMatchObject({
			wordId: null,
			segments: [],
			autoLinked: false
		});
	});

	it('prefers a known fused-token segmentation over a whole-token match', () => {
		const result = buildAutoLemmaTokenPlans(
			[{ tokenOrder: 0, surfaceForm: 'nenyun.', normalizedForm: 'nenyun' }],
			[],
			new Map([['nenyun', 'word-whole']]),
			new Map([
				[
					'nenyun',
					[
						{ normalizedForm: 'ne', wordId: 'word-ne' },
						{ normalizedForm: 'nyun', wordId: 'word-nyun' }
					]
				]
			])
		);

		expect(result.autoLinkedCount).toBe(2);
		expect(result.tokens[0]).toMatchObject({
			wordId: null,
			segments: [
				{ normalizedForm: 'ne', wordId: 'word-ne' },
				{ normalizedForm: 'nyun', wordId: 'word-nyun' }
			],
			autoLinked: true
		});
	});
});

describe('autoLemmatizeMissingExampleSentenceWords', () => {
	it('does not drop a token-level wordId from an existing pipe-marked token', async () => {
		const tx = {
			exampleSentenceToken: { update: vi.fn() },
			exampleSentenceTokenSegment: { update: vi.fn(), createMany: vi.fn() },
			exampleSentence: { update: vi.fn() },
			wordSentence: { createMany: vi.fn() },
			observedWordForm: { upsert: vi.fn() }
		};
		const db = {
			exampleSentence: {
				findMany: vi.fn().mockResolvedValue([
					{
						id: 'sentence-1',
						tokens: [
							{
								id: 'token-1',
								surfaceForm: 'ne|nyun',
								normalizedForm: 'ne|nyun',
								wordId: 'word-manual',
								inContextTranslation: 'mine',
								segments: []
							}
						]
					}
				])
			},
			observedWordForm: {
				findMany: vi.fn().mockResolvedValue([
					{ normalizedForm: 'ne', wordId: 'word-ne' },
					{ normalizedForm: 'nyun', wordId: 'word-nyun' }
				])
			},
			exampleSentenceToken: {
				findMany: vi.fn().mockResolvedValue([])
			},
			$transaction: vi.fn((callback) => callback(tx))
		};

		const result = await autoLemmatizeMissingExampleSentenceWords(db as never);

		expect(result).toEqual({
			scannedSentences: 1,
			updatedSentences: 0,
			linkedWords: 0,
			translatedWords: 0
		});
		expect(tx.exampleSentenceToken.update).not.toHaveBeenCalled();
		expect(tx.exampleSentenceTokenSegment.createMany).not.toHaveBeenCalled();
		expect(tx.exampleSentence.update).not.toHaveBeenCalled();
	});

	it('creates lexical segments for a fused token with a known prior segmentation', async () => {
		const tx = {
			exampleSentenceToken: { update: vi.fn() },
			exampleSentenceTokenSegment: { update: vi.fn(), createMany: vi.fn() },
			exampleSentence: { update: vi.fn() },
			wordSentence: { createMany: vi.fn() },
			observedWordForm: { upsert: vi.fn() }
		};
		const db = {
			exampleSentence: {
				findMany: vi.fn().mockResolvedValue([
					{
						id: 'sentence-1',
						tokens: [
							{
								id: 'token-1',
								surfaceForm: 'nenyun.',
								normalizedForm: 'nenyun',
								wordId: null,
								inContextTranslation: null,
								segments: []
							}
						]
					}
				])
			},
			observedWordForm: {
				findMany: vi.fn().mockResolvedValue([])
			},
			exampleSentenceToken: {
				findMany: vi.fn().mockResolvedValue([
					{
						normalizedForm: 'nenyun',
						segments: [
							{ normalizedForm: 'ne', wordId: 'word-ne' },
							{ normalizedForm: 'nyun', wordId: 'word-nyun' }
						]
					}
				])
			},
			$transaction: vi.fn((callback) => callback(tx))
		};

		const result = await autoLemmatizeMissingExampleSentenceWords(db as never);

		expect(result).toEqual({
			scannedSentences: 1,
			updatedSentences: 1,
			linkedWords: 2,
			translatedWords: 0
		});
		expect(tx.exampleSentenceTokenSegment.createMany).toHaveBeenCalledWith({
			data: [
				{
					tokenId: 'token-1',
					segmentOrder: 0,
					segmentStart: 0,
					segmentEnd: 2,
					surfaceForm: 'ne',
					normalizedForm: 'ne',
					wordId: 'word-ne'
				},
				{
					tokenId: 'token-1',
					segmentOrder: 1,
					segmentStart: 2,
					segmentEnd: 7,
					surfaceForm: 'nyun.',
					normalizedForm: 'nyun',
					wordId: 'word-nyun'
				}
			]
		});
		expect(tx.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 'sentence-1' },
			data: { status: 'NEEDS_PROOFREAD', lemmaProofreadAt: null }
		});
	});

	it('prefills in-context translations while linking existing missing tokens', async () => {
		const tx = {
			exampleSentenceToken: { update: vi.fn() },
			exampleSentenceTokenSegment: { update: vi.fn(), createMany: vi.fn() },
			exampleSentence: { update: vi.fn() },
			wordSentence: { createMany: vi.fn() },
			observedWordForm: { upsert: vi.fn() }
		};
		const db = {
			exampleSentence: {
				findMany: vi.fn().mockResolvedValue([
					{
						id: 'sentence-1',
						tokens: [
							{
								id: 'token-1',
								surfaceForm: 'Kaa.',
								normalizedForm: 'kaa',
								wordId: null,
								inContextTranslation: null,
								segments: []
							}
						]
					}
				])
			},
			observedWordForm: {
				findMany: vi.fn().mockResolvedValue([{ normalizedForm: 'kaa', wordId: 'word-kaa' }])
			},
			exampleSentenceToken: {
				findMany: vi
					.fn()
					.mockResolvedValueOnce([])
					.mockResolvedValueOnce([
						{
							normalizedForm: 'kaa',
							wordId: 'word-kaa',
							inContextTranslation: 'home'
						}
					])
			},
			$transaction: vi.fn((callback) => callback(tx))
		};

		const result = await autoLemmatizeMissingExampleSentenceWords(db as never);

		expect(result).toEqual({
			scannedSentences: 1,
			updatedSentences: 1,
			linkedWords: 1,
			translatedWords: 1
		});
		expect(tx.exampleSentenceToken.update).toHaveBeenCalledWith({
			where: { id: 'token-1' },
			data: { wordId: 'word-kaa', inContextTranslation: 'home' }
		});
	});

	it('prefills missing in-context translations for already-linked tokens', async () => {
		const tx = {
			exampleSentenceToken: { update: vi.fn() },
			exampleSentenceTokenSegment: { update: vi.fn(), createMany: vi.fn() },
			exampleSentence: { update: vi.fn() },
			wordSentence: { createMany: vi.fn() },
			observedWordForm: { upsert: vi.fn() }
		};
		const db = {
			exampleSentence: {
				findMany: vi.fn().mockResolvedValue([
					{
						id: 'sentence-1',
						tokens: [
							{
								id: 'token-1',
								surfaceForm: 'Kaa.',
								normalizedForm: 'kaa',
								wordId: 'word-kaa',
								inContextTranslation: null,
								segments: []
							}
						]
					}
				])
			},
			observedWordForm: {
				findMany: vi.fn().mockResolvedValue([])
			},
			exampleSentenceToken: {
				findMany: vi.fn().mockResolvedValueOnce([
					{
						normalizedForm: 'kaa',
						wordId: 'word-kaa',
						inContextTranslation: 'home'
					}
				])
			},
			$transaction: vi.fn((callback) => callback(tx))
		};

		const result = await autoLemmatizeMissingExampleSentenceWords(db as never);

		expect(result).toEqual({
			scannedSentences: 1,
			updatedSentences: 1,
			linkedWords: 0,
			translatedWords: 1
		});
		expect(tx.exampleSentenceToken.update).toHaveBeenCalledWith({
			where: { id: 'token-1' },
			data: { inContextTranslation: 'home' }
		});
		expect(tx.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 'sentence-1' },
			data: { status: 'NEEDS_PROOFREAD', lemmaProofreadAt: null }
		});
	});

});
