import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		$executeRaw: vi.fn(),
		$queryRaw: vi.fn(),
		$transaction: vi.fn(),
		word: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			update: vi.fn(),
			delete: vi.fn()
		},
		relatedWord: {
			createMany: vi.fn(),
			deleteMany: vi.fn()
		}
	};
	prisma.$transaction.mockImplementation(async (callback) => callback(prisma));

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

function updateWordRequest(values: Record<string, string> = {}) {
	const fd = new FormData();
	fd.set('kalenjin', values.kalenjin ?? 'che');
	fd.set('translations', values.translations ?? 'which are');
	fd.set('alternativeSpellings', values.alternativeSpellings ?? '');
	fd.set('notes', values.notes ?? '');
	fd.set('partOfSpeech', values.partOfSpeech ?? '');
	fd.set('pluralForm', values.pluralForm ?? '');
	fd.set('isPluralOnly', values.isPluralOnly ?? '');
	fd.set('isSingularOnly', values.isSingularOnly ?? '');
	fd.set('isSwahiliLoan', values.isSwahiliLoan ?? '');
	fd.set('alternativePluralForms', values.alternativePluralForms ?? '');
	return new Request('http://localhost/dictionary/che', { method: 'POST', body: fd });
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
		slug: 'che',
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

function mockSlugLookup(word: ReturnType<typeof makeWord>) {
	mocks.prisma.word.findUnique.mockResolvedValueOnce(word);
}

describe('dictionary detail page server', () => {
	beforeEach(() => {
		mocks.prisma.$executeRaw.mockReset();
		mocks.prisma.$queryRaw.mockReset();
		mocks.prisma.$transaction.mockReset();
		mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
		mocks.prisma.word.findUnique.mockReset();
		mocks.prisma.word.findMany.mockReset();
		mocks.prisma.word.update.mockReset();
		mocks.prisma.word.delete.mockReset();
		mocks.prisma.relatedWord.createMany.mockReset();
		mocks.prisma.relatedWord.deleteMany.mockReset();
		mocks.prisma.$queryRaw.mockResolvedValue([{ kalenjin: 'che', slug: 'che' }]);
	});

	it('loads related words when the current word is the source side', async () => {
		mockSlugLookup(
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

		await expect(load({ params: { id: 'che' } } as never)).resolves.toMatchObject({
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

	it('redirects legacy ID-only URLs to the readable canonical URL', async () => {
		mocks.prisma.word.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(makeWord());

		await expect(load({ params: { id: 'word-a' } } as never)).rejects.toMatchObject({
			status: 308,
			location: '/dictionary/che'
		});
	});

	it('preserves query strings when redirecting legacy URLs to the canonical slug', async () => {
		mocks.prisma.word.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(makeWord());

		await expect(
			load({
				params: { id: 'word-a' },
				url: new URL('http://localhost/dictionary/word-a?tab=examples&highlight=42')
			} as never)
		).rejects.toMatchObject({
			status: 308,
			location: '/dictionary/che?tab=examples&highlight=42'
		});
	});

	it('returns a clean 404 for malformed percent escapes', async () => {
		await expect(load({ params: { id: '%' } } as never)).rejects.toMatchObject({
			status: 404,
			body: { message: 'Word not found' }
		});

		expect(mocks.prisma.word.findUnique).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { slug: '%' }
			})
		);
		expect(mocks.prisma.word.findUnique).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: '%' }
			})
		);
	});

	it('redirects to the new readable URL after a headword rename updates the slug', async () => {
		const currentWord = makeWord({
			kalenjin: 'kot',
			slug: 'kot',
			translations: 'bag',
			imageUrl: null
		});
		const updatedWord = makeWord({
			kalenjin: 'kota',
			slug: 'kota',
			translations: 'bag',
			imageUrl: null
		});

		mocks.prisma.word.findUnique
			.mockResolvedValueOnce({ id: 'word-a' })
			.mockResolvedValueOnce(currentWord)
			.mockResolvedValueOnce(currentWord)
			.mockResolvedValueOnce(updatedWord);
		mocks.prisma.$queryRaw.mockResolvedValue([{ kalenjin: 'kot', slug: 'kot' }]);
		mocks.prisma.word.findMany.mockResolvedValue([]);
		mocks.prisma.word.update.mockResolvedValue(updatedWord);

		await expect(
			actions.update?.({
				params: { id: 'kot' },
				locals,
				request: updateWordRequest({ kalenjin: 'kota', translations: 'bag' })
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/dictionary/kota'
		});

		expect(mocks.prisma.word.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'word-a' },
				data: expect.objectContaining({ kalenjin: 'kota', slug: 'kota' })
			})
		);
	});

	it('bases rename propagation on the transaction-local word state', async () => {
		const staleCurrentWord = makeWord({
			kalenjin: 'kot',
			slug: 'kot',
			translations: 'bag',
			imageUrl: null
		});
		const transactionCurrentWord = makeWord({
			kalenjin: 'koti',
			slug: 'koti',
			translations: 'bag',
			imageUrl: null
		});

		mocks.prisma.word.findUnique
			.mockResolvedValueOnce({ id: 'word-a' })
			.mockResolvedValueOnce(staleCurrentWord)
			.mockResolvedValueOnce(transactionCurrentWord);
		mocks.prisma.$queryRaw.mockResolvedValue([{ kalenjin: 'koti', slug: 'koti' }]);
		mocks.prisma.word.update.mockResolvedValue(transactionCurrentWord);

		await expect(
			actions.update?.({
				params: { id: 'kot' },
				locals,
				request: updateWordRequest({ kalenjin: 'koti', translations: 'bag' })
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/dictionary/koti'
		});

		expect(mocks.prisma.word.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'word-a' },
				data: expect.not.objectContaining({ slug: expect.any(String) })
			})
		);
		expect(mocks.prisma.word.findMany).not.toHaveBeenCalled();
	});

	it('loads related words when the current word is the target side', async () => {
		mockSlugLookup(
			makeWord({
				id: 'word-b',
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

		await expect(load({ params: { id: 'che' } } as never)).resolves.toMatchObject({
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
		mockSlugLookup(
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

		const result = (await load({ params: { id: 'che' } } as never)) as {
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
		mocks.prisma.word.findUnique
			.mockResolvedValueOnce({ id: 'word-b' })
			.mockResolvedValueOnce({ id: 'word-b' })
			.mockResolvedValueOnce({ id: 'word-a' });

		await expect(addRelatedWord('word-b', 'word-a')).resolves.toEqual({ relatedWordSuccess: true });

		expect(mocks.prisma.word.findUnique).toHaveBeenCalledWith({
			where: { slug: 'word-b' },
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
		mocks.prisma.word.findUnique.mockResolvedValueOnce(null);
		mocks.prisma.word.findMany.mockResolvedValueOnce([]);

		await expect(addRelatedWord('word-a', 'word-b')).rejects.toMatchObject({
			status: 404,
			body: { message: 'Word not found' }
		});

		expect(mocks.prisma.relatedWord.createMany).not.toHaveBeenCalled();
	});

	it('rejects missing related words without creating a link', async () => {
		mocks.prisma.word.findUnique
			.mockResolvedValueOnce({ id: 'word-a' })
			.mockResolvedValueOnce({ id: 'word-a' })
			.mockResolvedValueOnce(null);

		await expect(addRelatedWord('word-a', 'word-b')).resolves.toMatchObject({
			status: 404,
			data: { relatedWordError: 'Related word not found.' }
		});

		expect(mocks.prisma.relatedWord.createMany).not.toHaveBeenCalled();
	});

	it('removes the canonical related-word pair from either side', async () => {
		mocks.prisma.word.findUnique.mockResolvedValueOnce({ id: 'word-b' });

		await expect(removeRelatedWord('word-b', 'word-a')).resolves.toEqual({ relatedWordSuccess: true });

		expect(mocks.prisma.relatedWord.deleteMany).toHaveBeenCalledWith({
			where: { wordId: 'word-a', relatedWordId: 'word-b' }
		});
	});
});
