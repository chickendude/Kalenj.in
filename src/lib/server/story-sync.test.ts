import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	canSplitStorySentence,
	mergeStorySentenceWithNext,
	splitStorySentence,
	syncStorySentences
} from './story-sync';
import {
	createExampleSentenceCompoundsFromPlans,
	createExampleSentenceTokensFromPlans,
	createExampleSentenceWithAutoLemma,
	createWordSentenceLinks,
	recordAutoLemmaObservedForms,
	resolveAutoLemmaTokenPlans
} from '$lib/server/auto-lemma';

vi.mock('$lib/server/prisma', () => ({
	prisma: {
		storySentence: { findMany: vi.fn() },
		$transaction: vi.fn()
	}
}));

vi.mock('$lib/server/auto-lemma', () => ({
	collectLinkedWordIds: vi.fn((tokens) => [
		...new Set(
			tokens
				.flatMap((token: { wordId: string | null; segments: Array<{ wordId: string | null }> }) => [
					token.wordId,
					...token.segments.map((segment) => segment.wordId)
				])
				.filter(Boolean)
		)
	]),
	createExampleSentenceCompoundsFromPlans: vi.fn(),
	createExampleSentenceTokensFromPlans: vi.fn(),
	createExampleSentenceWithAutoLemma: vi.fn(),
	createWordSentenceLinks: vi.fn(),
	recordAutoLemmaObservedForms: vi.fn(),
	resolveAutoLemmaTokenPlans: vi.fn(async (_tx, tokenData) => ({
		tokens: tokenData.map((token: { tokenOrder: number; surfaceForm: string; normalizedForm: string }) => ({
			...token,
			wordId: null,
			inContextTranslation: null,
			segments: [],
			autoLinked: false
		})),
		compounds: [],
		autoLinkedCount: 0
	}))
}));

const tx = {
	storySentence: {
		findMany: vi.fn(),
		deleteMany: vi.fn(),
		create: vi.fn(),
		findUnique: vi.fn(),
		findFirst: vi.fn(),
		updateMany: vi.fn(),
		delete: vi.fn()
	},
	exampleSentence: {
		findUnique: vi.fn(),
		update: vi.fn(),
		create: vi.fn(),
		delete: vi.fn(),
		deleteMany: vi.fn()
	},
	exampleSentenceToken: {
		deleteMany: vi.fn(),
		updateMany: vi.fn()
	},
	exampleSentenceCompound: {
		findMany: vi.fn(),
		deleteMany: vi.fn()
	},
	wordSentence: {
		deleteMany: vi.fn()
	},
	lessonWord: {
		findMany: vi.fn()
	}
};

function resetMocks() {
	for (const model of [
		tx.storySentence,
		tx.exampleSentence,
		tx.exampleSentenceToken,
		tx.exampleSentenceCompound,
		tx.wordSentence,
		tx.lessonWord
	]) {
		for (const mock of Object.values(model)) {
			mock.mockReset();
		}
	}

	vi.mocked(createExampleSentenceCompoundsFromPlans).mockReset();
	vi.mocked(createExampleSentenceTokensFromPlans).mockReset();
	vi.mocked(createExampleSentenceWithAutoLemma).mockReset();
	vi.mocked(createWordSentenceLinks).mockReset();
	vi.mocked(recordAutoLemmaObservedForms).mockReset();
	vi.mocked(resolveAutoLemmaTokenPlans).mockClear();
	vi.mocked(resolveAutoLemmaTokenPlans).mockImplementation(async (_tx, tokenData) => ({
		tokens: tokenData.map((token) => ({
			...token,
			wordId: null,
			inContextTranslation: null,
			segments: [],
			autoLinked: false
		})),
		compounds: [],
		autoLinkedCount: 0
	}));
	tx.lessonWord.findMany.mockResolvedValue([]);
	tx.exampleSentenceCompound.findMany.mockResolvedValue([]);
}

beforeEach(() => {
	resetMocks();
});

describe('syncStorySentences', () => {
	it('creates story placements that reference example sentences', async () => {
		tx.storySentence.findMany.mockResolvedValue([{ exampleSentenceId: 'old-example-1' }]);
		vi.mocked(createExampleSentenceWithAutoLemma).mockResolvedValue({ id: 'example-1' } as never);

		await syncStorySentences(tx as never, 'story-1', 'Oh eh\tHello you');

		expect(tx.storySentence.deleteMany).toHaveBeenCalledWith({ where: { storyId: 'story-1' } });
		expect(tx.exampleSentence.deleteMany).toHaveBeenCalledWith({
			where: { id: { in: ['old-example-1'] } }
		});
		expect(createExampleSentenceWithAutoLemma).toHaveBeenCalledWith(
			tx,
			expect.objectContaining({
				kalenjin: 'Oh eh',
				english: 'Hello you'
			})
		);
		expect(tx.storySentence.create).toHaveBeenCalledWith({
			data: {
				storyId: 'story-1',
				exampleSentenceId: 'example-1',
				sentenceOrder: 1,
				speaker: null
			}
		});
	});

	it('does not delete old story examples that are still used by lesson words', async () => {
		tx.storySentence.findMany.mockResolvedValue([
			{ exampleSentenceId: 'old-example-1' },
			{ exampleSentenceId: 'shared-example' }
		]);
		tx.lessonWord.findMany.mockResolvedValue([{ sentenceId: 'shared-example' }]);
		vi.mocked(createExampleSentenceWithAutoLemma).mockResolvedValue({ id: 'example-1' } as never);

		await syncStorySentences(tx as never, 'story-1', 'Oh eh\tHello you');

		expect(tx.exampleSentence.deleteMany).toHaveBeenCalledWith({
			where: { id: { in: ['old-example-1'] } }
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
});

describe('splitStorySentence', () => {
	it('is a no-op when the linked example sentence cannot be split', async () => {
		tx.storySentence.findUnique.mockResolvedValue({
			id: 'story-sentence-1',
			storyId: 'story-1',
			exampleSentenceId: 'example-1',
			sentenceOrder: 0,
			speaker: null,
			exampleSentence: {
				kalenjin: 'Chamgei nebo langat.',
				english: 'Good evening.',
				notes: null,
				imageUrl: null,
				audioUrl: null,
				audioRecordedById: null,
				audioRecordedAt: null,
				status: 'IN_CORPUS',
				lemmaProofreadAt: null,
				lessonWords: [],
				tokens: []
			}
		});

		const result = await splitStorySentence(tx as never, 'story-sentence-1');

		expect(result).toEqual({ splitCount: 1 });
		expect(tx.exampleSentence.update).not.toHaveBeenCalled();
		expect(tx.storySentence.create).not.toHaveBeenCalled();
	});

	it('splits text by creating new example sentences and story placements', async () => {
		tx.storySentence.findUnique.mockResolvedValue({
			id: 'story-sentence-1',
			storyId: 'story-1',
			exampleSentenceId: 'example-1',
			sentenceOrder: 2,
			speaker: 'Iyo',
			exampleSentence: {
				kalenjin: 'One. Two.',
				english: 'Un. Deux.',
				notes: 'Original note',
				imageUrl: 'image.jpg',
				audioUrl: 'audio.mp3',
				audioRecordedById: 'user-1',
				audioRecordedAt: new Date('2026-01-01T00:00:00.000Z'),
				status: 'NEEDS_PROOFREAD',
				lemmaProofreadAt: null,
				lessonWords: [],
				tokens: []
			}
		});
		tx.exampleSentence.create.mockResolvedValue({ id: 'example-2' });

		const result = await splitStorySentence(tx as never, 'story-sentence-1');

		expect(result).toEqual({ splitCount: 2 });
		expect(tx.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 'example-1' },
			data: {
				kalenjin: 'One.',
				english: 'Un.',
				status: 'NEEDS_PROOFREAD',
				lemmaProofreadAt: null
			}
		});
		expect(tx.exampleSentence.create).toHaveBeenCalledWith({
			data: {
				kalenjin: 'Two.',
				english: 'Deux.',
				notes: 'Original note',
				imageUrl: 'image.jpg',
				audioUrl: null,
				audioRecordedById: null,
				audioRecordedAt: null,
				status: 'NEEDS_PROOFREAD',
				lemmaProofreadAt: null
			},
			select: { id: true }
		});
		expect(tx.storySentence.create).toHaveBeenCalledWith({
			data: {
				storyId: 'story-1',
				exampleSentenceId: 'example-2',
				sentenceOrder: 3,
				speaker: 'Iyo'
			}
		});
	});

	it('refuses to split a story sentence shared with a lesson word', async () => {
		tx.storySentence.findUnique.mockResolvedValue({
			id: 'story-sentence-1',
			storyId: 'story-1',
			exampleSentenceId: 'example-1',
			sentenceOrder: 2,
			speaker: null,
			exampleSentence: {
				kalenjin: 'One. Two.',
				english: 'Un. Deux.',
				notes: null,
				imageUrl: null,
				audioUrl: null,
				audioRecordedById: null,
				audioRecordedAt: null,
				status: 'IN_CORPUS',
				lemmaProofreadAt: null,
				lessonWords: [{ id: 'lesson-word-1' }],
				tokens: []
			}
		});

		await expect(splitStorySentence(tx as never, 'story-sentence-1')).rejects.toThrow(
			'Cannot split a story sentence while it is used by a lesson word.'
		);
		expect(tx.exampleSentence.update).not.toHaveBeenCalled();
	});
});

describe('mergeStorySentenceWithNext', () => {
	it('returns { merged: false } when there is no following sentence', async () => {
		tx.storySentence.findUnique.mockResolvedValue({
			id: 'target-1',
			storyId: 'story-1',
			exampleSentenceId: 'example-1',
			sentenceOrder: 5,
			exampleSentence: {
				kalenjin: 'Hello',
				english: 'Hi',
				notes: null,
				imageUrl: null,
				audioUrl: null,
				audioRecordedById: null,
				audioRecordedAt: null,
				status: 'IN_CORPUS',
				lemmaProofreadAt: null,
				lessonWords: [],
				tokens: []
			}
		});
		tx.storySentence.findFirst.mockResolvedValue(null);

		const result = await mergeStorySentenceWithNext(tx as never, 'target-1');

		expect(result).toEqual({ merged: false });
		expect(tx.exampleSentence.update).not.toHaveBeenCalled();
		expect(tx.storySentence.delete).not.toHaveBeenCalled();
	});

	it('re-tokenizes the merged example sentence and deletes the next placement', async () => {
		tx.storySentence.findUnique.mockResolvedValue({
			id: 'target-1',
			storyId: 'story-1',
			exampleSentenceId: 'example-1',
			sentenceOrder: 3,
			exampleSentence: {
				kalenjin: 'One.',
				english: 'Un.',
				notes: null,
				imageUrl: null,
				audioUrl: null,
				audioRecordedById: null,
				audioRecordedAt: null,
				status: 'IN_CORPUS',
				lemmaProofreadAt: null,
				lessonWords: [],
				tokens: [
					{
						tokenOrder: 0,
						surfaceForm: 'One.',
						normalizedForm: 'one',
						wordId: null,
						inContextTranslation: null,
						segments: []
					}
				]
			}
		});
		tx.storySentence.findFirst.mockResolvedValue({
			id: 'next-1',
			exampleSentenceId: 'example-2',
			sentenceOrder: 4,
			exampleSentence: {
				kalenjin: 'Two.',
				english: 'Deux.',
				notes: null,
				imageUrl: null,
				audioUrl: 'next-audio.mp3',
				audioRecordedById: 'user-1',
				audioRecordedAt: new Date('2026-01-01T00:00:00.000Z'),
				status: 'NEEDS_PROOFREAD',
				lemmaProofreadAt: null,
				lessonWords: [],
				tokens: [
					{
						tokenOrder: 0,
						surfaceForm: 'Two.',
						normalizedForm: 'two',
						wordId: 'word-1',
						inContextTranslation: null,
						segments: []
					}
				]
			}
		});

		const result = await mergeStorySentenceWithNext(tx as never, 'target-1');

		expect(result).toEqual({ merged: true });
		expect(tx.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 'example-1' },
			data: expect.objectContaining({
				kalenjin: 'One. Two.',
				english: 'Un. Deux.',
				audioUrl: 'next-audio.mp3',
				audioRecordedById: 'user-1',
				audioRecordedAt: new Date('2026-01-01T00:00:00.000Z'),
				status: 'NEEDS_PROOFREAD',
				lemmaProofreadAt: null
			})
		});
		expect(createWordSentenceLinks).toHaveBeenCalledWith(tx, 'example-1', ['word-1']);
		expect(tx.exampleSentenceToken.updateMany).not.toHaveBeenCalled();
		expect(tx.storySentence.delete).toHaveBeenCalledWith({ where: { id: 'next-1' } });
		expect(tx.exampleSentence.delete).toHaveBeenCalledWith({ where: { id: 'example-2' } });
	});

	it('does not preserve token annotations by position when normalized forms changed', async () => {
		tx.storySentence.findUnique.mockResolvedValue({
			id: 'target-1',
			storyId: 'story-1',
			exampleSentenceId: 'example-1',
			sentenceOrder: 3,
			exampleSentence: {
				kalenjin: 'One',
				english: 'Un',
				notes: null,
				imageUrl: null,
				audioUrl: null,
				audioRecordedById: null,
				audioRecordedAt: null,
				status: 'IN_CORPUS',
				lemmaProofreadAt: null,
				lessonWords: [],
				tokens: [
					{
						tokenOrder: 0,
						surfaceForm: 'Shifted',
						normalizedForm: 'shifted',
						wordId: 'word-shifted',
						inContextTranslation: 'wrong slot',
						segments: []
					}
				]
			}
		});
		tx.storySentence.findFirst.mockResolvedValue({
			id: 'next-1',
			exampleSentenceId: 'example-2',
			sentenceOrder: 4,
			exampleSentence: {
				kalenjin: 'Two',
				english: 'Deux',
				notes: null,
				imageUrl: null,
				audioUrl: null,
				audioRecordedById: null,
				audioRecordedAt: null,
				status: 'IN_CORPUS',
				lemmaProofreadAt: null,
				lessonWords: [],
				tokens: [
					{
						tokenOrder: 0,
						surfaceForm: 'Two',
						normalizedForm: 'two',
						wordId: 'word-two',
						inContextTranslation: 'two translation',
						segments: []
					}
				]
			}
		});

		await mergeStorySentenceWithNext(tx as never, 'target-1');

		expect(createExampleSentenceTokensFromPlans).toHaveBeenCalledWith(tx, 'example-1', [
			expect.objectContaining({
				normalizedForm: 'one',
				wordId: null,
				inContextTranslation: null
			}),
			expect.objectContaining({
				normalizedForm: 'two',
				wordId: 'word-two',
				inContextTranslation: 'two translation'
			})
		]);
		expect(createWordSentenceLinks).toHaveBeenCalledWith(tx, 'example-1', ['word-two']);
	});

	it('refuses to merge when either sentence is shared with a lesson word', async () => {
		tx.storySentence.findUnique.mockResolvedValue({
			id: 'target-1',
			storyId: 'story-1',
			exampleSentenceId: 'example-1',
			sentenceOrder: 3,
			exampleSentence: {
				kalenjin: 'One.',
				english: 'Un.',
				notes: null,
				imageUrl: null,
				audioUrl: null,
				audioRecordedById: null,
				audioRecordedAt: null,
				status: 'IN_CORPUS',
				lemmaProofreadAt: null,
				lessonWords: [{ id: 'lesson-word-1' }],
				tokens: []
			}
		});
		tx.storySentence.findFirst.mockResolvedValue({
			id: 'next-1',
			exampleSentenceId: 'example-2',
			sentenceOrder: 4,
			exampleSentence: {
				kalenjin: 'Two.',
				english: 'Deux.',
				notes: null,
				imageUrl: null,
				audioUrl: null,
				audioRecordedById: null,
				audioRecordedAt: null,
				status: 'IN_CORPUS',
				lemmaProofreadAt: null,
				lessonWords: [],
				tokens: []
			}
		});

		await expect(mergeStorySentenceWithNext(tx as never, 'target-1')).rejects.toThrow(
			'Cannot merge story sentences while either sentence is used by a lesson word.'
		);
		expect(tx.exampleSentence.update).not.toHaveBeenCalled();
	});
});
