import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const tx = {
		exampleSentence: {
			create: vi.fn()
		},
		exampleSentenceToken: {
			findMany: vi.fn()
		},
		observedWordForm: {
			findMany: vi.fn(),
			upsert: vi.fn()
		},
		wordSentence: {
			createMany: vi.fn()
		}
	};

	const prisma = {
		exampleSentence: {
			findFirst: vi.fn()
		},
		$transaction: vi.fn()
	};

	return { prisma, tx };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

const { actions } = await import('./+page.server');

const locals = {
	user: { id: 'u1', username: 'admin', displayName: null, role: 'ADMIN' as const },
	sessionToken: 't'
};

function bulkRequest(bulkText: string) {
	const formData = new FormData();
	formData.set('bulkText', bulkText);
	return new Request('http://localhost/corpus', { method: 'POST', body: formData });
}

function reviewRequest(rows: Array<{ lineNumber: number; kalenjin: string; english: string }>) {
	const formData = new FormData();
	formData.set('reviewRows', JSON.stringify(rows));
	return new Request('http://localhost/corpus', { method: 'POST', body: formData });
}

async function previewBulkSentences(bulkText: string) {
	return actions.previewBulkSentences?.({
		request: bulkRequest(bulkText),
		locals
	} as never);
}

async function saveBulkSentences(rows: Array<{ lineNumber: number; kalenjin: string; english: string }>) {
	return actions.saveBulkSentences?.({
		request: reviewRequest(rows),
		locals
	} as never);
}

beforeEach(() => {
	mocks.prisma.exampleSentence.findFirst.mockReset();
	mocks.prisma.$transaction.mockReset();
	mocks.tx.exampleSentence.create.mockReset();
	mocks.tx.exampleSentenceToken.findMany.mockReset();
	mocks.tx.observedWordForm.findMany.mockReset();
	mocks.tx.observedWordForm.upsert.mockReset();
	mocks.tx.wordSentence.createMany.mockReset();
	mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
	mocks.prisma.exampleSentence.findFirst.mockResolvedValue(null);
	mocks.tx.exampleSentenceToken.findMany.mockResolvedValue([]);
	mocks.tx.observedWordForm.findMany.mockResolvedValue([]);
	mocks.tx.exampleSentence.create.mockResolvedValue({ id: 'sentence-created' });
});

describe('previewBulkSentences action', () => {
	it('returns normalized review rows without writing sentences', async () => {
		await expect(previewBulkSentences('labat kaa\tRun home')).resolves.toEqual({
			bulkReviewRows: [
				{
					lineNumber: 1,
					kalenjin: 'Labat kaa.',
					english: 'Run home.',
					warnings: [
						{
							field: 'kalenjin',
							code: 'missing-final-punctuation',
							message: 'Confirm punctuation'
						},
						{
							field: 'english',
							code: 'missing-final-punctuation',
							message: 'Confirm punctuation'
						}
					]
				}
			],
			bulkValues: { bulkText: 'labat kaa\tRun home' }
		});

		expect(mocks.prisma.exampleSentence.findFirst).not.toHaveBeenCalled();
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
		expect(mocks.tx.exampleSentence.create).not.toHaveBeenCalled();
	});

	it('returns the parser error without writing when a line is malformed', async () => {
		await expect(previewBulkSentences('Labat kaa. - Run home.')).resolves.toMatchObject({
			status: 400,
			data: {
				bulkError: 'Line 1: use either a tab or " – " between Kalenjin and English.'
			}
		});

		expect(mocks.prisma.exampleSentence.findFirst).not.toHaveBeenCalled();
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
		expect(mocks.tx.exampleSentence.create).not.toHaveBeenCalled();
	});
});

describe('saveBulkSentences action', () => {
	it('creates tokenized corpus sentences from reviewed rows', async () => {
		await expect(
			saveBulkSentences([
				{ lineNumber: 1, kalenjin: 'Labat kaa.', english: 'Run home.' },
				{ lineNumber: 2, kalenjin: 'Labat boisyet.', english: 'Run to work.' }
			])
		).resolves.toEqual({
			bulkSuccess: true,
			createdCount: 2,
			skippedCount: 0
		});

		expect(mocks.tx.exampleSentence.create).toHaveBeenNthCalledWith(1, {
			data: {
				kalenjin: 'Labat kaa.',
				english: 'Run home.',
				needsLemmaProofread: false,
				lemmaProofreadAt: null,
				tokens: {
					create: [
						{
							tokenOrder: 0,
							surfaceForm: 'Labat',
							normalizedForm: 'labat',
							wordId: null,
							inContextTranslation: null
						},
						{
							tokenOrder: 1,
							surfaceForm: 'kaa.',
							normalizedForm: 'kaa',
							wordId: null,
							inContextTranslation: null
						}
					]
				}
			}
		});
		expect(mocks.tx.exampleSentence.create).toHaveBeenNthCalledWith(2, {
			data: {
				kalenjin: 'Labat boisyet.',
				english: 'Run to work.',
				needsLemmaProofread: false,
				lemmaProofreadAt: null,
				tokens: {
					create: [
						{
							tokenOrder: 0,
							surfaceForm: 'Labat',
							normalizedForm: 'labat',
							wordId: null,
							inContextTranslation: null
						},
						{
							tokenOrder: 1,
							surfaceForm: 'boisyet.',
							normalizedForm: 'boisyet',
							wordId: null,
							inContextTranslation: null
						}
					]
				}
			}
		});
	});

	it('skips duplicates already in the database and duplicates in the paste', async () => {
		mocks.prisma.exampleSentence.findFirst
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ id: 'existing-1', lessonWords: [] })
			.mockResolvedValueOnce(null);

		await expect(
			saveBulkSentences([
				{ lineNumber: 1, kalenjin: 'Labat kaa.', english: 'Run home.' },
				{ lineNumber: 2, kalenjin: 'Labat kaa.', english: 'Run home.' },
				{ lineNumber: 3, kalenjin: 'Achome alabat.', english: 'I like running.' },
				{ lineNumber: 4, kalenjin: 'Chakten iwe boisyet.', english: 'Hurry to work.' }
			])
		).resolves.toEqual({
			bulkSuccess: true,
			createdCount: 2,
			skippedCount: 2
		});

		expect(mocks.prisma.exampleSentence.findFirst).toHaveBeenCalledTimes(3);
		expect(mocks.tx.exampleSentence.create).toHaveBeenCalledTimes(2);
		expect(mocks.tx.exampleSentence.create).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				data: expect.objectContaining({ kalenjin: 'Labat kaa.', english: 'Run home.' })
			})
		);
		expect(mocks.tx.exampleSentence.create).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				data: expect.objectContaining({
					kalenjin: 'Chakten iwe boisyet.',
					english: 'Hurry to work.'
				})
			})
		);
	});

	it('normalizes edited rows again before saving', async () => {
		await expect(
			saveBulkSentences([{ lineNumber: 1, kalenjin: 'labat kaa', english: 'run home' }])
		).resolves.toEqual({
			bulkSuccess: true,
			createdCount: 1,
			skippedCount: 0
		});

		expect(mocks.tx.exampleSentence.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				kalenjin: 'Labat kaa.',
				english: 'run home.'
			})
		});
	});
});
