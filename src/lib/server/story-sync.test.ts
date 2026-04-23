import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	canSplitStorySentence,
	mergeStorySentenceWithNext,
	splitStorySentence,
	syncStorySentenceToCorpus,
	syncStorySentences
} from './story-sync';

vi.mock('$lib/server/prisma', () => ({
	prisma: {
		storySentence: {
			findMany: vi.fn()
		},
		$transaction: vi.fn()
	}
}));

const tx = {
	storySentence: {
		deleteMany: vi.fn(),
		create: vi.fn(),
		findUnique: vi.fn(),
		findFirst: vi.fn(),
		updateMany: vi.fn(),
		update: vi.fn(),
		delete: vi.fn()
	},
	storySentenceToken: {
		findMany: vi.fn(),
		deleteMany: vi.fn(),
		createMany: vi.fn(),
		create: vi.fn(),
		updateMany: vi.fn()
	},
	storySentenceTokenSegment: {
		createMany: vi.fn()
	},
	exampleSentence: {
		upsert: vi.fn()
	},
	wordSentence: {
		deleteMany: vi.fn(),
		createMany: vi.fn()
	},
	exampleSentenceToken: {
		deleteMany: vi.fn(),
		create: vi.fn()
	}
};

function resetMocks() {
	for (const model of [
		tx.storySentence,
		tx.storySentenceToken,
		tx.storySentenceTokenSegment,
		tx.exampleSentence,
		tx.wordSentence,
		tx.exampleSentenceToken
	]) {
		for (const mock of Object.values(model)) {
			mock.mockReset();
		}
	}

	tx.storySentenceToken.findMany.mockResolvedValue([]);
	tx.exampleSentence.upsert.mockResolvedValue({ id: 'corpus-sentence-1' });
}

beforeEach(() => {
	resetMocks();
});

describe('syncStorySentences', () => {
	it('creates linked corpus sentences for imported story text', async () => {
		tx.storySentence.create.mockResolvedValue({
			id: 'story-sentence-1'
		});
		tx.storySentence.findUnique.mockResolvedValue({
			id: 'story-sentence-1',
			kalenjin: 'Oh eh',
			english: 'Hello you',
			tokens: [
				{
					tokenOrder: 0,
					surfaceForm: 'Oh',
					normalizedForm: 'oh',
					wordId: null,
					inContextTranslation: null,
					segments: []
				},
				{
					tokenOrder: 1,
					surfaceForm: 'eh',
					normalizedForm: 'eh',
					wordId: null,
					inContextTranslation: null,
					segments: []
				}
			]
		});

		await syncStorySentences(
			tx as never,
			'story-1',
			'Oh eh\tHello you'
		);

		expect(tx.storySentence.deleteMany).toHaveBeenCalledWith({
			where: { storyId: 'story-1' }
		});
		expect(tx.exampleSentence.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { storySentenceId: 'story-sentence-1' },
				create: expect.objectContaining({
					storySentenceId: 'story-sentence-1',
					kalenjin: 'Oh eh',
					english: 'Hello you'
				}),
				update: {
					kalenjin: 'Oh eh',
					english: 'Hello you'
				}
			})
		);
		expect(tx.exampleSentenceToken.create).toHaveBeenCalledTimes(2);
	});
});

describe('syncStorySentenceToCorpus', () => {
	it('copies story token links and lexical segments into the corpus entry', async () => {
		tx.storySentence.findUnique.mockResolvedValue({
			id: 'story-sentence-1',
			kalenjin: 'Kip kele',
			english: 'Kip said it',
			tokens: [
				{
					tokenOrder: 0,
					surfaceForm: 'Kip',
					normalizedForm: 'kip',
					wordId: 'word-kip',
					inContextTranslation: 'name',
					segments: []
				},
				{
					tokenOrder: 1,
					surfaceForm: 'kele',
					normalizedForm: 'kele',
					wordId: null,
					inContextTranslation: null,
					segments: [
						{
							segmentOrder: 0,
							segmentStart: 0,
							segmentEnd: 2,
							surfaceForm: 'ke',
							normalizedForm: 'ke',
							wordId: 'word-ke'
						},
						{
							segmentOrder: 1,
							segmentStart: 2,
							segmentEnd: 4,
							surfaceForm: 'le',
							normalizedForm: 'le',
							wordId: 'word-le'
						}
					]
				}
			]
		});

		await syncStorySentenceToCorpus(tx as never, 'story-sentence-1');

		expect(tx.exampleSentence.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { storySentenceId: 'story-sentence-1' },
				update: {
					kalenjin: 'Kip kele',
					english: 'Kip said it'
				}
			})
		);
		expect(tx.wordSentence.deleteMany).toHaveBeenCalledWith({
			where: { exampleSentenceId: 'corpus-sentence-1' }
		});
		expect(tx.exampleSentenceToken.deleteMany).toHaveBeenCalledWith({
			where: { exampleSentenceId: 'corpus-sentence-1' }
		});
		expect(tx.exampleSentenceToken.create).toHaveBeenNthCalledWith(1, {
			data: {
				exampleSentenceId: 'corpus-sentence-1',
				tokenOrder: 0,
				surfaceForm: 'Kip',
				normalizedForm: 'kip',
				wordId: 'word-kip',
				inContextTranslation: 'name'
			}
		});
		expect(tx.exampleSentenceToken.create).toHaveBeenNthCalledWith(2, {
			data: {
				exampleSentenceId: 'corpus-sentence-1',
				tokenOrder: 1,
				surfaceForm: 'kele',
				normalizedForm: 'kele',
				wordId: null,
				inContextTranslation: null,
				segments: {
					createMany: {
						data: [
							{
								segmentOrder: 0,
								segmentStart: 0,
								segmentEnd: 2,
								surfaceForm: 'ke',
								normalizedForm: 'ke',
								wordId: 'word-ke'
							},
							{
								segmentOrder: 1,
								segmentStart: 2,
								segmentEnd: 4,
								surfaceForm: 'le',
								normalizedForm: 'le',
								wordId: 'word-le'
							}
						]
					}
				}
			}
		});
		expect(tx.wordSentence.createMany).toHaveBeenCalledWith({
			data: [
				{ wordId: 'word-kip', exampleSentenceId: 'corpus-sentence-1' },
				{ wordId: 'word-ke', exampleSentenceId: 'corpus-sentence-1' },
				{ wordId: 'word-le', exampleSentenceId: 'corpus-sentence-1' }
			]
		});
	});
});

describe('canSplitStorySentence', () => {
	it('returns true when the text has multiple terminated sentences', () => {
		expect(canSplitStorySentence('Chamgei. Kilyan?')).toBe(true);
	});

	it('returns false for a single sentence', () => {
		expect(canSplitStorySentence('Chamgei nebo langat.')).toBe(false);
	});

	it('returns false for empty text', () => {
		expect(canSplitStorySentence('')).toBe(false);
	});
});

describe('splitStorySentence', () => {
	it('is a no-op when the sentence cannot be split', async () => {
		tx.storySentence.findUnique.mockResolvedValue({
			id: 'story-sentence-1',
			storyId: 'story-1',
			sentenceOrder: 0,
			speaker: null,
			kalenjin: 'Chamgei nebo langat.',
			english: 'Good evening.',
			tokens: []
		});

		const result = await splitStorySentence(tx as never, 'story-sentence-1');

		expect(result).toEqual({ splitCount: 1 });
		expect(tx.storySentence.updateMany).not.toHaveBeenCalled();
		expect(tx.storySentence.create).not.toHaveBeenCalled();
	});

	it('throws when the sentence is not found', async () => {
		tx.storySentence.findUnique.mockResolvedValue(null);

		await expect(splitStorySentence(tx as never, 'missing')).rejects.toThrow(
			'Story sentence not found.'
		);
	});

	it('parks subsequent sentence orders above an offset before bringing them down', async () => {
		let findUniqueCall = 0;
		tx.storySentence.findUnique.mockImplementation(() => {
			findUniqueCall += 1;
			if (findUniqueCall === 1) {
				return Promise.resolve({
					id: 'story-sentence-1',
					storyId: 'story-1',
					sentenceOrder: 2,
					speaker: 'Iyo',
					kalenjin: 'One. Two.',
					english: 'Un. Deux.',
					tokens: []
				});
			}
			return Promise.resolve({
				id: 'story-sentence-x',
				kalenjin: '',
				english: '',
				tokens: []
			});
		});
		tx.storySentence.create.mockResolvedValue({ id: 'story-sentence-2' });

		const result = await splitStorySentence(tx as never, 'story-sentence-1');

		expect(result).toEqual({ splitCount: 2 });
		expect(tx.storySentence.updateMany).toHaveBeenNthCalledWith(1, {
			where: { storyId: 'story-1', sentenceOrder: { gt: 2 } },
			data: { sentenceOrder: { increment: 1_000_001 } }
		});
		expect(tx.storySentence.updateMany).toHaveBeenNthCalledWith(2, {
			where: { storyId: 'story-1', sentenceOrder: { gte: 1_000_000 } },
			data: { sentenceOrder: { decrement: 1_000_000 } }
		});
		expect(tx.storySentence.update).toHaveBeenCalledWith({
			where: { id: 'story-sentence-1' },
			data: { kalenjin: 'One.', english: 'Un.' }
		});
		expect(tx.storySentence.create).toHaveBeenCalledWith({
			data: {
				storyId: 'story-1',
				sentenceOrder: 3,
				speaker: 'Iyo',
				kalenjin: 'Two.',
				english: 'Deux.'
			},
			select: { id: true }
		});
	});
});

describe('mergeStorySentenceWithNext', () => {
	it('returns { merged: false } when there is no following sentence', async () => {
		tx.storySentence.findUnique.mockResolvedValue({
			id: 'story-sentence-1',
			storyId: 'story-1',
			sentenceOrder: 5,
			kalenjin: 'Hello',
			english: 'Hi',
			tokens: []
		});
		tx.storySentence.findFirst.mockResolvedValue(null);

		const result = await mergeStorySentenceWithNext(tx as never, 'story-sentence-1');

		expect(result).toEqual({ merged: false });
		expect(tx.storySentence.update).not.toHaveBeenCalled();
		expect(tx.storySentence.delete).not.toHaveBeenCalled();
	});

	it('throws when the sentence is not found', async () => {
		tx.storySentence.findUnique.mockResolvedValue(null);

		await expect(mergeStorySentenceWithNext(tx as never, 'missing')).rejects.toThrow(
			'Story sentence not found.'
		);
	});

	it('reassigns tokens, joins text, deletes the next row, and shifts orders via offset', async () => {
		let findUniqueCall = 0;
		tx.storySentence.findUnique.mockImplementation(() => {
			findUniqueCall += 1;
			if (findUniqueCall === 1) {
				return Promise.resolve({
					id: 'target-1',
					storyId: 'story-1',
					sentenceOrder: 3,
					kalenjin: 'One.',
					english: 'Un.',
					tokens: [{ id: 't1' }, { id: 't2' }]
				});
			}
			return Promise.resolve({
				id: 'target-1',
				kalenjin: 'One. Two.',
				english: 'Un. Deux.',
				tokens: [
					{
						tokenOrder: 0,
						surfaceForm: 'One',
						normalizedForm: 'one',
						wordId: null,
						inContextTranslation: null,
						segments: []
					},
					{
						tokenOrder: 1,
						surfaceForm: 'Two',
						normalizedForm: 'two',
						wordId: null,
						inContextTranslation: null,
						segments: []
					}
				]
			});
		});
		tx.storySentence.findFirst.mockResolvedValue({
			id: 'next-1',
			sentenceOrder: 4,
			kalenjin: 'Two.',
			english: 'Deux.',
			tokens: [{ id: 't3' }]
		});

		const result = await mergeStorySentenceWithNext(tx as never, 'target-1');

		expect(result).toEqual({ merged: true });
		expect(tx.storySentenceToken.updateMany).toHaveBeenCalledWith({
			where: { storySentenceId: 'next-1' },
			data: {
				storySentenceId: 'target-1',
				tokenOrder: { increment: 2 }
			}
		});
		expect(tx.storySentence.update).toHaveBeenCalledWith({
			where: { id: 'target-1' },
			data: { kalenjin: 'One. Two.', english: 'Un. Deux.' }
		});
		expect(tx.storySentence.delete).toHaveBeenCalledWith({ where: { id: 'next-1' } });
		expect(tx.storySentence.updateMany).toHaveBeenNthCalledWith(1, {
			where: { storyId: 'story-1', sentenceOrder: { gt: 4 } },
			data: { sentenceOrder: { increment: 1_000_000 } }
		});
		expect(tx.storySentence.updateMany).toHaveBeenNthCalledWith(2, {
			where: { storyId: 'story-1', sentenceOrder: { gte: 1_000_000 } },
			data: { sentenceOrder: { decrement: 1_000_001 } }
		});
	});

	it('skips the token reassignment when the next sentence has no tokens', async () => {
		let findUniqueCall = 0;
		tx.storySentence.findUnique.mockImplementation(() => {
			findUniqueCall += 1;
			if (findUniqueCall === 1) {
				return Promise.resolve({
					id: 'target-1',
					storyId: 'story-1',
					sentenceOrder: 0,
					kalenjin: 'One.',
					english: 'Un.',
					tokens: []
				});
			}
			return Promise.resolve({
				id: 'target-1',
				kalenjin: 'One. Two.',
				english: 'Un. Deux.',
				tokens: [
					{
						tokenOrder: 0,
						surfaceForm: 'One',
						normalizedForm: 'one',
						wordId: null,
						inContextTranslation: null,
						segments: []
					}
				]
			});
		});
		tx.storySentence.findFirst.mockResolvedValue({
			id: 'next-1',
			sentenceOrder: 1,
			kalenjin: 'Two.',
			english: 'Deux.',
			tokens: []
		});

		await mergeStorySentenceWithNext(tx as never, 'target-1');

		expect(tx.storySentenceToken.updateMany).not.toHaveBeenCalled();
	});
});
