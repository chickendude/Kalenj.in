import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

const mocks = vi.hoisted(() => {
	const tx = {
		exampleSentence: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		exampleSentenceToken: {
			update: vi.fn(),
			updateMany: vi.fn(),
			delete: vi.fn(),
			create: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn()
		},
		exampleSentenceTokenSegment: {
			deleteMany: vi.fn(),
			createMany: vi.fn()
		},
		wordSentence: {
			createMany: vi.fn(),
			deleteMany: vi.fn()
		},
		observedWordForm: {
			upsert: vi.fn(),
			updateMany: vi.fn(),
			deleteMany: vi.fn(),
			findMany: vi.fn()
		},
		exampleSentenceCompound: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			deleteMany: vi.fn()
		},
		word: {
			findUnique: vi.fn(),
			findMany: vi.fn()
		},
		wordComponent: {
			findMany: vi.fn()
		}
	};

	const prisma = {
		exampleSentence: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		exampleSentenceToken: {
			findMany: vi.fn(),
			update: vi.fn()
		},
		observedWordForm: {
			upsert: vi.fn(),
			updateMany: vi.fn(),
			deleteMany: vi.fn()
		},
		$transaction: vi.fn()
	};

	return { prisma, tx };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

function resetMocks() {
	for (const model of [
		mocks.prisma.exampleSentence,
		mocks.prisma.exampleSentenceToken,
		mocks.prisma.observedWordForm,
		mocks.tx.exampleSentence,
		mocks.tx.exampleSentenceToken,
		mocks.tx.exampleSentenceTokenSegment,
		mocks.tx.wordSentence,
		mocks.tx.observedWordForm,
		mocks.tx.exampleSentenceCompound,
		mocks.tx.word,
		mocks.tx.wordComponent
	]) {
		for (const mock of Object.values(model)) {
			mock.mockReset();
		}
	}

	mocks.prisma.$transaction.mockReset();
	mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
	mocks.tx.exampleSentenceCompound.findFirst.mockResolvedValue(null);
	mocks.tx.exampleSentenceCompound.findMany.mockResolvedValue([]);
	mocks.tx.observedWordForm.findMany.mockResolvedValue([]);
	mocks.tx.word.findMany.mockResolvedValue([]);
	mocks.tx.wordComponent.findMany.mockResolvedValue([]);
	mocks.tx.exampleSentenceToken.findMany.mockResolvedValue([]);
	mocks.tx.exampleSentence.findUnique.mockResolvedValue(null);
}

async function post(sentenceId: string, payload: Record<string, unknown>) {
	return POST({
		params: { id: sentenceId },
		locals: { user: { id: 'u1', username: 'tester', displayName: null, role: 'ADMIN' }, sessionToken: 't' },
		request: new Request(`http://localhost/corpus/${sentenceId}/token-groups`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		})
	} as never);
}

beforeEach(() => {
	resetMocks();
});

describe('POST /corpus/[id]/token-groups', () => {
	it('splits a corpus token and returns every refreshed token for the sentence', async () => {
		mocks.prisma.exampleSentence.findUnique.mockResolvedValue({ id: 'sentence-1' });
		mocks.prisma.exampleSentenceToken.findMany
			.mockResolvedValueOnce([
				{
					id: 'token-a',
					tokenOrder: 0,
					surfaceForm: 'Missing kot',
					wordId: 'word-a',
					inContextTranslation: 'missing house'
				},
				{
					id: 'token-b',
					tokenOrder: 1,
					surfaceForm: 'ak',
					wordId: null,
					inContextTranslation: null
				}
			])
			.mockResolvedValueOnce([
				{
					id: 'token-a',
					tokenOrder: 0,
					surfaceForm: 'Missing',
					wordId: 'word-a',
					inContextTranslation: 'missing',
					word: { id: 'word-a', kalenjin: 'missing', translations: 'missing' }
				},
				{
					id: 'created-token',
					tokenOrder: 1,
					surfaceForm: 'kot',
					wordId: null,
					inContextTranslation: 'house',
					word: null
				},
				{
					id: 'token-b',
					tokenOrder: 2,
					surfaceForm: 'ak',
					wordId: null,
					inContextTranslation: null,
					word: null
				}
			]);

		const response = await post('sentence-1', {
			action: 'split',
			sentenceId: 'sentence-1',
			tokenId: 'token-a'
		});

		expect(response.status).toBe(200);
		expect(mocks.tx.exampleSentenceToken.update).toHaveBeenCalledWith({
			where: { id: 'token-a' },
			data: {
				tokenOrder: 0,
				surfaceForm: 'Missing',
				normalizedForm: 'missing',
				inContextTranslation: 'missing'
			}
		});
		expect(mocks.tx.exampleSentenceToken.create).toHaveBeenCalledWith({
			data: {
				exampleSentenceId: 'sentence-1',
				tokenOrder: 1,
				surfaceForm: 'kot',
				normalizedForm: 'kot',
				inContextTranslation: 'house'
			}
		});
		expect(mocks.tx.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 'sentence-1' },
			data: { kalenjin: 'Missing kot ak' }
		});
		await expect(response.json()).resolves.toEqual({
			tokens: [
				expect.objectContaining({ id: 'token-a', surfaceForm: 'Missing' }),
				expect.objectContaining({ id: 'created-token', surfaceForm: 'kot' }),
				expect.objectContaining({ id: 'token-b', surfaceForm: 'ak' })
			]
		});
	});

	it('rejects splitting a token that already has lexical segments', async () => {
		mocks.prisma.exampleSentence.findUnique.mockResolvedValue({ id: 'sentence-1' });
		mocks.prisma.exampleSentenceToken.findMany.mockResolvedValueOnce([
			{
				id: 'token-a',
				tokenOrder: 0,
				surfaceForm: 'Missing kot',
				normalizedForm: 'missing kot',
				wordId: 'word-a',
				inContextTranslation: 'missing house',
				segments: [{ wordId: 'word-kot', normalizedForm: 'kot' }]
			}
		]);

		await expect(
			post('sentence-1', {
				action: 'split',
				sentenceId: 'sentence-1',
				tokenId: 'token-a'
			})
		).rejects.toMatchObject({
			status: 400,
			body: { message: 'Remove lexical segments before splitting this word.' }
		});
		expect(mocks.tx.exampleSentenceToken.update).not.toHaveBeenCalled();
		expect(mocks.tx.exampleSentenceToken.create).not.toHaveBeenCalled();
	});

	it('marks lexical segment boundaries within a corpus token', async () => {
		mocks.prisma.exampleSentence.findUnique.mockResolvedValue({ id: 'sentence-1' });
		mocks.prisma.exampleSentenceToken.findMany
			.mockResolvedValueOnce([
				{
					id: 'token-a',
					tokenOrder: 0,
					surfaceForm: 'Kotab',
					wordId: null,
					inContextTranslation: 'house of'
				}
			])
			.mockResolvedValueOnce([
				{
					id: 'token-a',
					tokenOrder: 0,
					surfaceForm: 'Kotab',
					wordId: null,
					inContextTranslation: 'house of',
					word: null,
					segments: [
						{
							id: 'segment-a',
							segmentOrder: 0,
							segmentStart: 0,
							segmentEnd: 3,
							surfaceForm: 'Kot',
							wordId: null,
							word: null
						},
						{
							id: 'segment-b',
							segmentOrder: 1,
							segmentStart: 3,
							segmentEnd: 5,
							surfaceForm: 'ab',
							wordId: null,
							word: null
						}
					]
				}
			]);

		const response = await post('sentence-1', {
			action: 'segments',
			sentenceId: 'sentence-1',
			tokenId: 'token-a',
			splitPoints: [3]
		});

		expect(response.status).toBe(200);
		expect(mocks.tx.exampleSentenceToken.update).toHaveBeenCalledWith({
			where: { id: 'token-a' },
			data: { wordId: null }
		});
		expect(mocks.tx.exampleSentenceTokenSegment.deleteMany).toHaveBeenCalledWith({
			where: { tokenId: 'token-a' }
		});
		expect(mocks.tx.exampleSentenceTokenSegment.createMany).toHaveBeenCalledWith({
			data: [
				expect.objectContaining({
					tokenId: 'token-a',
					segmentOrder: 0,
					segmentStart: 0,
					segmentEnd: 3,
					surfaceForm: 'Kot',
					normalizedForm: 'kot'
				}),
				expect.objectContaining({
					tokenId: 'token-a',
					segmentOrder: 1,
					segmentStart: 3,
					segmentEnd: 5,
					surfaceForm: 'ab',
					normalizedForm: 'ab'
				})
			]
		});
		await expect(response.json()).resolves.toEqual({
			tokens: [
				expect.objectContaining({
					id: 'token-a',
					surfaceForm: 'Kotab',
					segments: [
						expect.objectContaining({ id: 'segment-a', surfaceForm: 'Kot' }),
						expect.objectContaining({ id: 'segment-b', surfaceForm: 'ab' })
					]
				})
			]
		});
	});

	it('removes stale word-sentence links when lexical segments are unsplit', async () => {
		mocks.prisma.exampleSentence.findUnique.mockResolvedValue({ id: 'sentence-1' });
		mocks.prisma.exampleSentenceToken.findMany
			.mockResolvedValueOnce([
				{
					id: 'token-a',
					tokenOrder: 0,
					surfaceForm: 'nenyun.',
					normalizedForm: 'nenyun',
					wordId: null,
					inContextTranslation: null,
					segments: [
						{ wordId: 'word-ne', normalizedForm: 'ne' },
						{ wordId: 'word-nyun', normalizedForm: 'nyun' }
					]
				}
			])
			.mockResolvedValueOnce([
				{
					id: 'token-a',
					tokenOrder: 0,
					surfaceForm: 'nenyun.',
					normalizedForm: 'nenyun',
					wordId: null,
					inContextTranslation: null,
					word: null,
					segments: []
				}
			]);
		mocks.tx.exampleSentenceToken.findFirst.mockResolvedValue(null);

		const response = await post('sentence-1', {
			action: 'unsplit',
			sentenceId: 'sentence-1',
			tokenId: 'token-a'
		});

		expect(response.status).toBe(200);
		expect(mocks.tx.exampleSentenceTokenSegment.deleteMany).toHaveBeenCalledWith({
			where: { tokenId: 'token-a' }
		});
		expect(mocks.tx.wordSentence.deleteMany).toHaveBeenCalledWith({
			where: { wordId: 'word-ne', exampleSentenceId: 'sentence-1' }
		});
		expect(mocks.tx.wordSentence.deleteMany).toHaveBeenCalledWith({
			where: { wordId: 'word-nyun', exampleSentenceId: 'sentence-1' }
		});
		expect(mocks.tx.exampleSentenceToken.findFirst).toHaveBeenCalledTimes(2);
		await expect(response.json()).resolves.toEqual({
			tokens: [
				expect.objectContaining({
					id: 'token-a',
					surfaceForm: 'nenyun.',
					segments: []
				})
			]
		});
	});

	it('groups adjacent tokens into a compound span and auto-links a matching entry', async () => {
		mocks.prisma.exampleSentence.findUnique.mockResolvedValue({ id: 'sentence-1' });
		mocks.prisma.exampleSentenceToken.findMany
			.mockResolvedValueOnce([
				{
					id: 'token-a',
					tokenOrder: 0,
					surfaceForm: 'Kipire',
					normalizedForm: 'kipire',
					wordId: 'word-pir',
					compoundId: null,
					inContextTranslation: null,
					segments: []
				},
				{
					id: 'token-b',
					tokenOrder: 1,
					surfaceForm: 'bek.',
					normalizedForm: 'bek',
					wordId: null,
					compoundId: null,
					inContextTranslation: null,
					segments: []
				}
			])
			.mockResolvedValueOnce([]);
		mocks.tx.word.findMany.mockResolvedValue([
			{ id: 'word-swim', kalenjinNormalized: 'kipire bek' }
		]);
		mocks.tx.exampleSentenceCompound.create.mockResolvedValue({ id: 'compound-1' });

		const response = await post('sentence-1', {
			action: 'compound',
			sentenceId: 'sentence-1',
			sourceTokenId: 'token-a',
			targetTokenId: 'token-b'
		});

		expect(response.status).toBe(200);
		expect(mocks.tx.exampleSentenceCompound.create).toHaveBeenCalledWith({
			data: {
				exampleSentenceId: 'sentence-1',
				normalizedForm: 'kipire bek',
				wordId: 'word-swim'
			}
		});
		expect(mocks.tx.exampleSentenceToken.updateMany).toHaveBeenCalledWith({
			where: { id: { in: ['token-a', 'token-b'] } },
			data: { compoundId: 'compound-1' }
		});
		expect(mocks.tx.observedWordForm.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					normalizedForm_wordId: { normalizedForm: 'kipire bek', wordId: 'word-swim' }
				}
			})
		);
	});

	it('rejects grouping non-adjacent tokens', async () => {
		mocks.prisma.exampleSentence.findUnique.mockResolvedValue({ id: 'sentence-1' });
		mocks.prisma.exampleSentenceToken.findMany.mockResolvedValueOnce([
			{
				id: 'token-a',
				tokenOrder: 0,
				surfaceForm: 'pir',
				normalizedForm: 'pir',
				wordId: null,
				compoundId: null,
				inContextTranslation: null,
				segments: []
			},
			{
				id: 'token-b',
				tokenOrder: 1,
				surfaceForm: 'en',
				normalizedForm: 'en',
				wordId: null,
				compoundId: null,
				inContextTranslation: null,
				segments: []
			},
			{
				id: 'token-c',
				tokenOrder: 2,
				surfaceForm: 'bek',
				normalizedForm: 'bek',
				wordId: null,
				compoundId: null,
				inContextTranslation: null,
				segments: []
			}
		]);

		const response = await post('sentence-1', {
			action: 'compound',
			sentenceId: 'sentence-1',
			sourceTokenId: 'token-a',
			targetTokenId: 'token-c'
		}).catch((thrown) => thrown);

		expect(response).toMatchObject({
			status: 400,
			body: { message: 'Only adjacent words can be grouped.' }
		});
		expect(mocks.tx.exampleSentenceCompound.create).not.toHaveBeenCalled();
	});

	it('ungroups a compound and cleans up its observed form and sentence link', async () => {
		mocks.prisma.exampleSentence.findUnique.mockResolvedValue({ id: 'sentence-1' });
		mocks.prisma.exampleSentenceToken.findMany
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);
		mocks.tx.exampleSentenceCompound.findUnique.mockResolvedValue({
			id: 'compound-1',
			exampleSentenceId: 'sentence-1',
			wordId: 'word-swim',
			normalizedForm: 'kipire bek',
			inContextTranslation: "we're swimming"
		});
		mocks.tx.exampleSentenceToken.findFirst.mockResolvedValue(null);

		const response = await post('sentence-1', {
			action: 'uncompound',
			sentenceId: 'sentence-1',
			compoundId: 'compound-1'
		});

		expect(response.status).toBe(200);
		expect(mocks.tx.exampleSentenceCompound.delete).toHaveBeenCalledWith({
			where: { id: 'compound-1' }
		});
		expect(mocks.tx.observedWordForm.deleteMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ normalizedForm: 'kipire bek', wordId: 'word-swim' })
			})
		);
		expect(mocks.tx.wordSentence.deleteMany).toHaveBeenCalledWith({
			where: { wordId: 'word-swim', exampleSentenceId: 'sentence-1' }
		});
	});

	it('links a compound to a chosen entry and records the joined observed form', async () => {
		mocks.prisma.exampleSentence.findUnique.mockResolvedValue({ id: 'sentence-1' });
		mocks.prisma.exampleSentenceToken.findMany
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);
		mocks.tx.exampleSentenceCompound.findUnique.mockResolvedValue({
			id: 'compound-1',
			exampleSentenceId: 'sentence-1',
			wordId: null,
			normalizedForm: 'kipire bek',
			inContextTranslation: null
		});
		mocks.tx.word.findUnique.mockResolvedValue({ id: 'word-swim' });

		const response = await post('sentence-1', {
			action: 'compound-link',
			sentenceId: 'sentence-1',
			compoundId: 'compound-1',
			wordId: 'word-swim'
		});

		expect(response.status).toBe(200);
		expect(mocks.tx.exampleSentenceCompound.update).toHaveBeenCalledWith({
			where: { id: 'compound-1' },
			data: { wordId: 'word-swim' }
		});
		expect(mocks.tx.observedWordForm.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					normalizedForm_wordId: { normalizedForm: 'kipire bek', wordId: 'word-swim' }
				}
			})
		);
		expect(mocks.tx.wordSentence.createMany).toHaveBeenCalledWith({
			data: [{ wordId: 'word-swim', exampleSentenceId: 'sentence-1' }],
			skipDuplicates: true
		});
	});

	it('positionally links unlinked members from the entry components on compound-link', async () => {
		mocks.prisma.exampleSentence.findUnique.mockResolvedValue({ id: 'sentence-1' });
		mocks.prisma.exampleSentenceToken.findMany
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);
		mocks.tx.exampleSentenceCompound.findUnique.mockResolvedValue({
			id: 'compound-1',
			exampleSentenceId: 'sentence-1',
			wordId: null,
			normalizedForm: 'kipire bek',
			inContextTranslation: null
		});
		mocks.tx.word.findUnique.mockResolvedValue({ id: 'word-swim' });
		mocks.tx.wordComponent.findMany.mockResolvedValue([
			{ compoundWordId: 'word-swim', componentWordId: 'word-pir' },
			{ compoundWordId: 'word-swim', componentWordId: 'word-bek' }
		]);
		mocks.tx.exampleSentenceToken.findMany.mockResolvedValue([
			{ id: 'token-a', wordId: null, normalizedForm: 'kipire', segments: [] },
			{ id: 'token-b', wordId: 'word-water', normalizedForm: 'bek', segments: [] }
		]);

		const response = await post('sentence-1', {
			action: 'compound-link',
			sentenceId: 'sentence-1',
			compoundId: 'compound-1',
			wordId: 'word-swim'
		});

		expect(response.status).toBe(200);
		expect(mocks.tx.exampleSentenceToken.update).toHaveBeenCalledWith({
			where: { id: 'token-a' },
			data: { wordId: 'word-pir' }
		});
		expect(mocks.tx.exampleSentenceToken.update).toHaveBeenCalledTimes(1);
		expect(mocks.tx.observedWordForm.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { normalizedForm_wordId: { normalizedForm: 'kipire', wordId: 'word-pir' } }
			})
		);
	});
});
