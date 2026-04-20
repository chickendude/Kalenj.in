import { describe, expect, it, beforeEach, vi } from 'vitest';
import { POST } from './+server';

const mocks = vi.hoisted(() => {
	const tx = {
		exampleSentence: {
			update: vi.fn()
		},
		exampleSentenceToken: {
			findMany: vi.fn(),
			deleteMany: vi.fn(),
			createMany: vi.fn()
		}
	};

	const prisma = {
		lessonWord: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		exampleSentence: {
			findFirst: vi.fn(),
			update: vi.fn()
		},
		$transaction: vi.fn()
	};

	return { prisma, tx };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

function resetMocks() {
	for (const model of [
		mocks.prisma.lessonWord,
		mocks.prisma.exampleSentence,
		mocks.tx.exampleSentence,
		mocks.tx.exampleSentenceToken
	]) {
		for (const mock of Object.values(model)) {
			mock.mockReset();
		}
	}

	mocks.prisma.$transaction.mockReset();
	mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
	mocks.tx.exampleSentenceToken.findMany.mockResolvedValue([]);
	mocks.prisma.exampleSentence.findFirst.mockResolvedValue(null);
}

async function post(payload: Record<string, unknown>, lessonId = 'lesson-1') {
	return POST({
		params: { id: lessonId },
		locals: { user: { id: 'u1', username: 'tester', displayName: null, role: 'ADMIN' }, sessionToken: 't' },
		request: new Request('http://localhost/lessons/lesson-1/lesson-word-inline', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		})
	} as never);
}

function expectExistingTokenLookup() {
	expect(mocks.tx.exampleSentenceToken.findMany).toHaveBeenCalledWith(
		expect.objectContaining({
			where: { exampleSentenceId: 'sentence-1' }
		})
	);
}

beforeEach(() => {
	resetMocks();
	mocks.prisma.lessonWord.findUnique.mockResolvedValue({
		sentenceId: 'sentence-1',
		sentence: { kalenjin: 'Oh eh', english: 'Hey you' },
		lessonSection: { lessonId: 'lesson-1' }
	});
});

describe('POST /lessons/[id]/lesson-word-inline', () => {
	it('splits saved vocabulary sentences into space-separated tokens', async () => {
		const response = await post({
			lessonWordId: 'lesson-word-1',
			field: 'sentenceKalenjin',
			value: 'Oh eh'
		});

		expect(response.status).toBe(200);
		expect(mocks.tx.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 'sentence-1' },
			data: { kalenjin: 'Oh eh' }
		});
		expect(mocks.tx.exampleSentenceToken.deleteMany).toHaveBeenCalledWith({
			where: { exampleSentenceId: 'sentence-1' }
		});
		expect(mocks.tx.exampleSentenceToken.createMany).toHaveBeenCalledWith({
			data: [
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
			]
		});
	});

	it('re-syncs tokens even when the saved sentence text did not change', async () => {
		await post({
			lessonWordId: 'lesson-word-1',
			field: 'sentenceKalenjin',
			value: 'Oh eh'
		});

		expect(mocks.tx.exampleSentenceToken.deleteMany).toHaveBeenCalledTimes(1);
		expect(mocks.tx.exampleSentenceToken.createMany).toHaveBeenCalledTimes(1);
	});

	it('preserves marked lemmas and meanings on matching regenerated tokens', async () => {
		mocks.tx.exampleSentenceToken.findMany.mockResolvedValue([
			{
				tokenOrder: 0,
				surfaceForm: 'Oh',
				normalizedForm: 'oh',
				wordId: 'word-oh',
				inContextTranslation: 'hello',
				word: { kalenjinNormalized: 'oh' }
			},
			{
				tokenOrder: 1,
				surfaceForm: 'eh',
				normalizedForm: 'eh',
				wordId: 'word-eh',
				inContextTranslation: 'you',
				word: { kalenjinNormalized: 'eh' }
			}
		]);

		await post({
			lessonWordId: 'lesson-word-1',
			field: 'sentenceKalenjin',
			value: 'Oh there eh'
		});

		expectExistingTokenLookup();
		expect(mocks.tx.exampleSentenceToken.createMany).toHaveBeenCalledWith({
			data: [
				{
					exampleSentenceId: 'sentence-1',
					tokenOrder: 0,
					surfaceForm: 'Oh',
					normalizedForm: 'oh',
					wordId: 'word-oh',
					inContextTranslation: 'hello'
				},
				{
					exampleSentenceId: 'sentence-1',
					tokenOrder: 1,
					surfaceForm: 'there',
					normalizedForm: 'there'
				},
				{
					exampleSentenceId: 'sentence-1',
					tokenOrder: 2,
					surfaceForm: 'eh',
					normalizedForm: 'eh',
					wordId: 'word-eh',
					inContextTranslation: 'you'
				}
			]
		});
	});

	it('preserves an old unsplit token link when its lemma matches a regenerated word', async () => {
		mocks.tx.exampleSentenceToken.findMany.mockResolvedValue([
			{
				tokenOrder: 0,
				surfaceForm: 'Oh eh',
				normalizedForm: 'oh eh',
				wordId: 'word-oh',
				inContextTranslation: 'hello',
				word: { kalenjinNormalized: 'oh' }
			}
		]);

		await post({
			lessonWordId: 'lesson-word-1',
			field: 'sentenceKalenjin',
			value: 'Oh eh'
		});

		expectExistingTokenLookup();
		expect(mocks.tx.exampleSentenceToken.createMany).toHaveBeenCalledWith({
			data: [
				{
					exampleSentenceId: 'sentence-1',
					tokenOrder: 0,
					surfaceForm: 'Oh',
					normalizedForm: 'oh',
					wordId: 'word-oh',
					inContextTranslation: 'hello'
				},
				{
					exampleSentenceId: 'sentence-1',
					tokenOrder: 1,
					surfaceForm: 'eh',
					normalizedForm: 'eh'
				}
			]
		});
	});
});
