import { describe, expect, it, beforeEach, vi } from 'vitest';
import { POST } from './+server';

const mocks = vi.hoisted(() => {
	const tx = {
		storySentenceToken: {
			update: vi.fn(),
			delete: vi.fn(),
			create: vi.fn()
		},
		exampleSentenceToken: {
			update: vi.fn(),
			delete: vi.fn(),
			create: vi.fn()
		}
	};

	const prisma = {
		lesson: {
			findUnique: vi.fn()
		},
		lessonWord: {
			findFirst: vi.fn()
		},
		storySentence: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		exampleSentence: {
			update: vi.fn()
		},
		storySentenceToken: {
			findMany: vi.fn(),
			update: vi.fn()
		},
		exampleSentenceToken: {
			findMany: vi.fn(),
			update: vi.fn()
		},
		$transaction: vi.fn()
	};

	return { prisma, tx };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

function resetMocks() {
	for (const model of [
		mocks.prisma.lesson,
		mocks.prisma.lessonWord,
		mocks.prisma.storySentence,
		mocks.prisma.exampleSentence,
		mocks.prisma.storySentenceToken,
		mocks.prisma.exampleSentenceToken,
		mocks.tx.storySentenceToken,
		mocks.tx.exampleSentenceToken
	]) {
		for (const mock of Object.values(model)) {
			mock.mockReset();
		}
	}

	mocks.prisma.$transaction.mockReset();
	mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
}

async function post(payload: Record<string, unknown>, lessonId = 'lesson-1') {
	return POST({
		params: { id: lessonId },
		locals: { user: { id: 'u1', username: 'tester', displayName: null, role: 'ADMIN' }, sessionToken: 't' },
		request: new Request('http://localhost/lessons/lesson-1/token-groups', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		})
	} as never);
}

beforeEach(() => {
	resetMocks();
});

describe('POST /lessons/[id]/token-groups', () => {
	it('rejects payloads without a sentence kind and id before touching the database', async () => {
		const response = await post({ action: 'merge', sentenceId: 'story-sentence-1' });

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: 'Sentence is required.' });
		expect(mocks.prisma.lesson.findUnique).not.toHaveBeenCalled();
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});

	it('merges adjacent story tokens and refreshes the story sentence text', async () => {
		mocks.prisma.lesson.findUnique.mockResolvedValue({ storyId: 'story-1' });
		mocks.prisma.storySentence.findUnique.mockResolvedValue({
			id: 'story-sentence-1',
			storyId: 'story-1'
		});
		mocks.prisma.storySentenceToken.findMany
			.mockResolvedValueOnce([
				{
					id: 'token-a',
					tokenOrder: 0,
					surfaceForm: 'Oh',
					wordId: null,
					inContextTranslation: 'wow'
				},
				{
					id: 'token-b',
					tokenOrder: 1,
					surfaceForm: 'eh',
					wordId: 'word-b',
					inContextTranslation: 'hey'
				},
				{
					id: 'token-c',
					tokenOrder: 2,
					surfaceForm: 'kararan',
					wordId: null,
					inContextTranslation: null
				}
			])
			.mockResolvedValueOnce([
				{
					id: 'token-a',
					tokenOrder: 0,
					surfaceForm: 'Oh eh',
					wordId: 'word-b',
					inContextTranslation: 'wow hey',
					word: null
				},
				{
					id: 'token-c',
					tokenOrder: 1,
					surfaceForm: 'kararan',
					wordId: null,
					inContextTranslation: null,
					word: null
				}
			]);

		const response = await post({
			kind: 'story',
			action: 'merge',
			sentenceId: 'story-sentence-1',
			sourceTokenId: 'token-a',
			targetTokenId: 'token-b'
		});

		expect(response.status).toBe(200);
		expect(mocks.tx.storySentenceToken.delete).toHaveBeenCalledWith({
			where: { id: 'token-b' }
		});
		expect(mocks.tx.storySentenceToken.update).toHaveBeenCalledWith({
			where: { id: 'token-a' },
			data: expect.objectContaining({
				tokenOrder: 0,
				surfaceForm: 'Oh eh',
				normalizedForm: 'oh eh',
				wordId: 'word-b',
				inContextTranslation: 'wow hey'
			})
		});
		expect(mocks.prisma.storySentence.update).toHaveBeenCalledWith({
			where: { id: 'story-sentence-1' },
			data: { kalenjin: 'Oh eh kararan' }
		});
		await expect(response.json()).resolves.toEqual({
			tokens: expect.arrayContaining([
				expect.objectContaining({ id: 'token-a', surfaceForm: 'Oh eh' })
			])
		});
	});

	it('splits an example token through the example sentence path', async () => {
		mocks.prisma.lessonWord.findFirst.mockResolvedValue({ id: 'lesson-word-1' });
		mocks.prisma.exampleSentenceToken.findMany
			.mockResolvedValueOnce([
				{
					id: 'token-a',
					tokenOrder: 0,
					surfaceForm: 'Oh eh',
					wordId: 'word-a',
					inContextTranslation: 'wow hey'
				},
				{
					id: 'token-b',
					tokenOrder: 1,
					surfaceForm: 'kararan',
					wordId: null,
					inContextTranslation: null
				}
			])
			.mockResolvedValueOnce([
				{
					id: 'token-a',
					tokenOrder: 0,
					surfaceForm: 'Oh',
					wordId: 'word-a',
					inContextTranslation: 'wow',
					word: null
				},
				{
					id: 'created-token',
					tokenOrder: 1,
					surfaceForm: 'eh',
					wordId: null,
					inContextTranslation: 'hey',
					word: null
				},
				{
					id: 'token-b',
					tokenOrder: 2,
					surfaceForm: 'kararan',
					wordId: null,
					inContextTranslation: null,
					word: null
				}
			]);

		const response = await post({
			kind: 'example',
			action: 'split',
			sentenceId: 'example-sentence-1',
			tokenId: 'token-a'
		});

		expect(response.status).toBe(200);
		expect(mocks.tx.exampleSentenceToken.update).toHaveBeenCalledWith({
			where: { id: 'token-a' },
			data: {
				tokenOrder: 0,
				surfaceForm: 'Oh',
				normalizedForm: 'oh',
				inContextTranslation: 'wow'
			}
		});
		expect(mocks.tx.exampleSentenceToken.create).toHaveBeenCalledWith({
			data: {
				exampleSentenceId: 'example-sentence-1',
				tokenOrder: 1,
				surfaceForm: 'eh',
				normalizedForm: 'eh',
				inContextTranslation: 'hey'
			}
		});
		expect(mocks.prisma.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 'example-sentence-1' },
			data: { kalenjin: 'Oh eh kararan' }
		});
		await expect(response.json()).resolves.toEqual({
			tokens: expect.arrayContaining([
				expect.objectContaining({ id: 'token-a', surfaceForm: 'Oh' }),
				expect.objectContaining({ id: 'created-token', surfaceForm: 'eh' })
			])
		});
	});

	it('updates a token surface and writes the rebuilt example sentence text', async () => {
		mocks.prisma.lessonWord.findFirst.mockResolvedValue({ id: 'lesson-word-1' });
		mocks.prisma.exampleSentenceToken.findMany
			.mockResolvedValueOnce([
				{
					id: 'token-a',
					tokenOrder: 0,
					surfaceForm: 'Oh',
					wordId: null,
					inContextTranslation: null
				},
				{
					id: 'token-b',
					tokenOrder: 1,
					surfaceForm: 'eh',
					wordId: null,
					inContextTranslation: null
				}
			])
			.mockResolvedValueOnce([
				{
					id: 'token-a',
					tokenOrder: 0,
					surfaceForm: 'Oh',
					wordId: null,
					inContextTranslation: null,
					word: null
				},
				{
					id: 'token-b',
					tokenOrder: 1,
					surfaceForm: 'eeh',
					wordId: null,
					inContextTranslation: null,
					word: null
				}
			]);

		const response = await post({
			kind: 'example',
			action: 'surface',
			sentenceId: 'example-sentence-1',
			tokenId: 'token-b',
			surfaceForm: ' eeh '
		});

		expect(response.status).toBe(200);
		expect(mocks.prisma.exampleSentenceToken.update).toHaveBeenCalledWith({
			where: { id: 'token-b' },
			data: {
				surfaceForm: 'eeh',
				normalizedForm: 'eeh'
			}
		});
		expect(mocks.prisma.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 'example-sentence-1' },
			data: { kalenjin: 'Oh eeh' }
		});
	});
});
