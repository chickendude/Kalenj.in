import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

const mocks = vi.hoisted(() => {
	const tx = {
		exampleSentenceToken: {
			update: vi.fn(),
			delete: vi.fn(),
			create: vi.fn()
		},
		exampleSentenceTokenSegment: {
			deleteMany: vi.fn(),
			createMany: vi.fn()
		},
		observedWordForm: {
			upsert: vi.fn(),
			updateMany: vi.fn(),
			deleteMany: vi.fn()
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
		mocks.tx.exampleSentenceToken,
		mocks.tx.exampleSentenceTokenSegment,
		mocks.tx.observedWordForm
	]) {
		for (const mock of Object.values(model)) {
			mock.mockReset();
		}
	}

	mocks.prisma.$transaction.mockReset();
	mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
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
		expect(mocks.prisma.exampleSentence.update).toHaveBeenCalledWith({
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

		const response = await post('sentence-1', {
			action: 'split',
			sentenceId: 'sentence-1',
			tokenId: 'token-a'
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: 'Remove lexical segments before splitting this word.'
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
});
