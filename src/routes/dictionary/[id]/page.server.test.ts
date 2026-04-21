import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		word: {
			findUnique: vi.fn(),
			update: vi.fn(),
			delete: vi.fn()
		},
		relatedWord: {
			createMany: vi.fn(),
			deleteMany: vi.fn()
		}
	};

	return { prisma };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

const { actions, load } = await import('./+page.server');

const locals = {
	user: { id: 'u1', username: 'admin', displayName: null, role: 'ADMIN' as const },
	sessionToken: 't'
};

function relatedWordRequest(relatedWordId: string) {
	const fd = new FormData();
	fd.set('relatedWordId', relatedWordId);
	return new Request('http://localhost/dictionary/word-a', { method: 'POST', body: fd });
}

async function addRelatedWord(wordId: string, relatedWordId: string) {
	return actions.addRelatedWord?.({
		params: { id: wordId },
		locals,
		request: relatedWordRequest(relatedWordId)
	} as never);
}

async function removeRelatedWord(wordId: string, relatedWordId: string) {
	return actions.removeRelatedWord?.({
		params: { id: wordId },
		locals,
		request: relatedWordRequest(relatedWordId)
	} as never);
}

function makeWord(overrides: Record<string, unknown> = {}) {
	return {
		id: 'word-a',
		kalenjin: 'che',
		translations: 'which are',
		kalenjinNormalized: 'che',
		partOfSpeech: null,
		notes: null,
		pluralForm: null,
		pluralFormNormalized: null,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		updatedAt: new Date('2026-01-01T00:00:00.000Z'),
		spellings: [],
		sentences: [],
		relatedWords: [],
		relatedToWords: [],
		...overrides
	};
}

describe('dictionary detail related words', () => {
	beforeEach(() => {
		mocks.prisma.word.findUnique.mockReset();
		mocks.prisma.word.update.mockReset();
		mocks.prisma.word.delete.mockReset();
		mocks.prisma.relatedWord.createMany.mockReset();
		mocks.prisma.relatedWord.deleteMany.mockReset();
	});

	it('loads related words when the current word is the source side', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue(
			makeWord({
				relatedWords: [
					{
						createdAt: new Date('2026-01-02T00:00:00.000Z'),
						relatedWord: {
							id: 'word-b',
							kalenjin: 'ne',
							translations: 'which is',
							partOfSpeech: null
						}
					}
				]
			})
		);

		await expect(load({ params: { id: 'word-a' } } as never)).resolves.toMatchObject({
			word: {
				id: 'word-a',
				relatedWords: [
					{
						word: {
							id: 'word-b',
							kalenjin: 'ne',
							translations: 'which is',
							partOfSpeech: null
						}
					}
				]
			}
		});
	});

	it('loads related words when the current word is the target side', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue(
			makeWord({
				relatedToWords: [
					{
						createdAt: new Date('2026-01-02T00:00:00.000Z'),
						word: {
							id: 'word-a',
							kalenjin: 'ne',
							translations: 'which is',
							partOfSpeech: null
						}
					}
				]
			})
		);

		await expect(load({ params: { id: 'word-b' } } as never)).resolves.toMatchObject({
			word: {
				relatedWords: [
					{
						word: {
							id: 'word-a',
							kalenjin: 'ne',
							translations: 'which is',
							partOfSpeech: null
						}
					}
				]
			}
		});
	});

	it('sorts related words across both sides by Kalenjin headword', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue(
			makeWord({
				relatedWords: [
					{
						createdAt: new Date('2026-01-02T00:00:00.000Z'),
						relatedWord: {
							id: 'word-c',
							kalenjin: 'tor',
							translations: 'other',
							partOfSpeech: null
						}
					}
				],
				relatedToWords: [
					{
						createdAt: new Date('2026-01-03T00:00:00.000Z'),
						word: {
							id: 'word-b',
							kalenjin: 'ne',
							translations: 'which is',
							partOfSpeech: null
						}
					}
				]
			})
		);

		const result = (await load({ params: { id: 'word-a' } } as never)) as {
			word: {
				relatedWords: Array<{
					word: { kalenjin: string };
				}>;
			};
		};

		expect(result.word.relatedWords.map((link) => link.word.kalenjin)).toEqual(['ne', 'tor']);
	});

	it('rejects self-links before touching the database', async () => {
		await expect(addRelatedWord('word-a', 'word-a')).resolves.toMatchObject({
			status: 400,
			data: { relatedWordError: 'A word cannot be related to itself.' }
		});

		expect(mocks.prisma.word.findUnique).not.toHaveBeenCalled();
		expect(mocks.prisma.relatedWord.createMany).not.toHaveBeenCalled();
	});

	it('adds one canonical related-word pair and skips duplicate pairs', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue({ id: 'word-found' });

		await expect(addRelatedWord('word-b', 'word-a')).resolves.toEqual({ relatedWordSuccess: true });

		expect(mocks.prisma.word.findUnique).toHaveBeenCalledWith({
			where: { id: 'word-b' },
			select: { id: true }
		});
		expect(mocks.prisma.word.findUnique).toHaveBeenCalledWith({
			where: { id: 'word-a' },
			select: { id: true }
		});
		expect(mocks.prisma.relatedWord.createMany).toHaveBeenCalledWith({
			data: [{ wordId: 'word-a', relatedWordId: 'word-b' }],
			skipDuplicates: true
		});
	});

	it('returns a clean 404 when adding from a missing current word', async () => {
		mocks.prisma.word.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'word-b' });

		await expect(addRelatedWord('word-a', 'word-b')).rejects.toMatchObject({
			status: 404,
			body: { message: 'Word not found' }
		});

		expect(mocks.prisma.relatedWord.createMany).not.toHaveBeenCalled();
	});

	it('rejects missing related words without creating a link', async () => {
		mocks.prisma.word.findUnique.mockResolvedValueOnce({ id: 'word-a' }).mockResolvedValueOnce(null);

		await expect(addRelatedWord('word-a', 'word-b')).resolves.toMatchObject({
			status: 404,
			data: { relatedWordError: 'Related word not found.' }
		});

		expect(mocks.prisma.relatedWord.createMany).not.toHaveBeenCalled();
	});

	it('removes the canonical related-word pair from either side', async () => {
		await expect(removeRelatedWord('word-b', 'word-a')).resolves.toEqual({ relatedWordSuccess: true });

		expect(mocks.prisma.relatedWord.deleteMany).toHaveBeenCalledWith({
			where: { wordId: 'word-a', relatedWordId: 'word-b' }
		});
	});
});
