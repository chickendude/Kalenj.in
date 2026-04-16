import { describe, expect, it, beforeEach, vi } from 'vitest';
import { POST } from './+server';

const mocks = vi.hoisted(() => {
	const tx = {
		exampleSentenceToken: {
			update: vi.fn(),
			create: vi.fn()
		}
	};

	const prisma = {
		exampleSentenceToken: {
			findUnique: vi.fn(),
			findMany: vi.fn()
		},
		exampleSentence: {
			update: vi.fn()
		},
		$transaction: vi.fn()
	};

	return { prisma, tx };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

function resetMocks() {
	for (const model of [
		mocks.prisma.exampleSentenceToken,
		mocks.prisma.exampleSentence,
		mocks.tx.exampleSentenceToken
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
		request: new Request(`http://localhost/corpus/${sentenceId}/split-token`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		})
	} as never);
}

beforeEach(() => {
	resetMocks();
});

describe('POST /corpus/[id]/split-token', () => {
	it('rejects a split request without split points', async () => {
		mocks.prisma.exampleSentenceToken.findUnique.mockResolvedValue({
			id: 'token-2',
			exampleSentenceId: 'sentence-1',
			tokenOrder: 1,
			surfaceForm: 'Missingkot'
		});

		const response = await post('sentence-1', {
			tokenId: 'token-2',
			splitPoints: []
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: 'Choose at least one split point in "Missingkot".'
		});
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
		expect(mocks.prisma.exampleSentence.update).not.toHaveBeenCalled();
	});

	it('splits a token, updates the sentence text, and avoids a second token reload', async () => {
		mocks.prisma.exampleSentenceToken.findUnique.mockResolvedValue({
			id: 'token-2',
			exampleSentenceId: 'sentence-1',
			tokenOrder: 1,
			surfaceForm: 'Missingkot'
		});
		mocks.prisma.exampleSentenceToken.findMany.mockResolvedValue([
			{ id: 'token-1', tokenOrder: 0 },
			{ id: 'token-2', tokenOrder: 1 },
			{ id: 'token-3', tokenOrder: 2 }
		]);

		mocks.tx.exampleSentenceToken.update.mockImplementation(async (args) => {
			if (args.include?.word) {
				return {
					id: args.where.id,
					...args.data,
					word: null
				};
			}

			if (args.select?.surfaceForm) {
				const surfaces: Record<string, string> = {
					'token-1': 'Chamgei',
					'token-3': 'ak'
				};

				return {
					surfaceForm: surfaces[args.where.id] ?? args.data.surfaceForm
				};
			}

			return {
				id: args.where.id,
				...args.data
			};
		});
		mocks.tx.exampleSentenceToken.create.mockImplementation(async (args) => ({
			id: 'created-token',
			...args.data,
			word: null
		}));

		const response = await post('sentence-1', {
			tokenId: 'token-2',
			splitPoints: [7]
		});

		expect(response.status).toBe(200);
		expect(mocks.prisma.exampleSentenceToken.findMany).toHaveBeenCalledTimes(1);
		expect(mocks.prisma.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 'sentence-1' },
			data: { kalenjin: 'Chamgei Missing kot ak' }
		});
		expect(mocks.tx.exampleSentenceToken.update).toHaveBeenCalledWith({
			where: { id: 'token-2' },
			data: {
				tokenOrder: 1,
				surfaceForm: 'Missing',
				normalizedForm: 'missing'
			},
			include: { word: true }
		});
		expect(mocks.tx.exampleSentenceToken.create).toHaveBeenCalledWith({
			data: {
				exampleSentenceId: 'sentence-1',
				tokenOrder: 2,
				surfaceForm: 'kot',
				normalizedForm: 'kot'
			},
			include: { word: true }
		});
		await expect(response.json()).resolves.toEqual({
			success: 'Token split.',
			tokenId: 'token-2',
			tokens: [
				expect.objectContaining({ id: 'token-2', surfaceForm: 'Missing' }),
				expect.objectContaining({ id: 'created-token', surfaceForm: 'kot' })
			]
		});
	});
});
