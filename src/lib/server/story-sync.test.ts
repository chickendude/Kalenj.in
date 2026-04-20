import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncStorySentenceToCorpus, syncStorySentences } from './story-sync';

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
		findUnique: vi.fn()
	},
	storySentenceToken: {
		findMany: vi.fn(),
		deleteMany: vi.fn(),
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
