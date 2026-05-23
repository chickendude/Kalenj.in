import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		exampleSentence: {
			findMany: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn()
		},
		word: {
			findMany: vi.fn()
		},
		ignoredWordForm: {
			findMany: vi.fn()
		}
	};
	return { prisma };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

const { load, actions } = await import('./+page.server');

type Role = 'ADMIN' | 'MANAGER';
type Locals = {
	user: { id: string; username: string; displayName: null; role: Role } | null;
	sessionToken: string | null;
};

const editorLocals: Locals = {
	user: { id: 'u1', username: 'editor', displayName: null, role: 'MANAGER' },
	sessionToken: 't'
};

describe('lemma proofread page loader', () => {
	beforeEach(() => {
		for (const model of [mocks.prisma.exampleSentence, mocks.prisma.word, mocks.prisma.ignoredWordForm]) {
			for (const mock of Object.values(model)) {
				mock.mockReset();
			}
		}
		mocks.prisma.exampleSentence.findMany.mockResolvedValue([]);
		mocks.prisma.word.findMany.mockResolvedValue([]);
		mocks.prisma.ignoredWordForm.findMany.mockResolvedValue([]);
	});

	it('requires an editor role', async () => {
		await expect(
			load({
				locals: { user: null, sessionToken: null },
				url: new URL('http://localhost/admin/proofread')
			} as never)
		).rejects.toMatchObject({
			status: 404
		});
	});

	it('loads only sentences queued for lemma proofread', async () => {
		await load({ locals: editorLocals, url: new URL('http://localhost/admin/proofread') } as never);

		expect(mocks.prisma.exampleSentence.findMany).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				where: { needsLemmaProofread: true }
			})
		);
	});

	it('sorts by lemma completeness and paginates the visible queue', async () => {
		const sentence = (
			id: string,
			updatedAt: string,
			tokenStates: Array<boolean>
		) => ({
			id,
			updatedAt: new Date(updatedAt),
			tokens: tokenStates.map((linked, index) => ({
				normalizedForm: `word-${id}-${index}`,
				wordId: linked ? `word-${id}-${index}` : null,
				segments: []
			}))
		});
		mocks.prisma.exampleSentence.findMany
			.mockResolvedValueOnce([
				sentence('one-of-ten', '2026-05-01', [true, false, false, false, false, false, false, false, false, false]),
				sentence('five-of-five', '2026-05-02', [true, true, true, true, true]),
				sentence('four-of-five', '2026-05-03', [true, true, true, true, false]),
				sentence('six-of-six', '2026-05-04', [true, true, true, true, true, true])
			])
			.mockResolvedValueOnce([
				{ id: 'five-of-five' },
				{ id: 'six-of-six' },
				{ id: 'four-of-five' },
				{ id: 'one-of-ten' }
			]);

		const result = (await load({
			locals: editorLocals,
			url: new URL('http://localhost/admin/proofread')
		} as never)) as {
			sentences: Array<{ id: string; lemmaStats: { linkedUnits: number; totalUnits: number; missingUnits: number } }>;
		};

		expect(mocks.prisma.exampleSentence.findMany).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				where: { id: { in: ['five-of-five', 'six-of-six', 'four-of-five', 'one-of-ten'] } }
			})
		);
		expect(result.sentences.map((entry) => entry.id)).toEqual([
			'five-of-five',
			'six-of-six',
			'four-of-five',
			'one-of-ten'
		]);
		expect(result.sentences[2]).toMatchObject({
			lemmaStats: { linkedUnits: 4, totalUnits: 5, missingUnits: 1 }
		});
	});
});

describe('lemma proofread actions', () => {
	beforeEach(() => {
		for (const model of [mocks.prisma.exampleSentence, mocks.prisma.word, mocks.prisma.ignoredWordForm]) {
			for (const mock of Object.values(model)) {
				mock.mockReset();
			}
		}
		mocks.prisma.exampleSentence.findMany.mockResolvedValue([]);
		mocks.prisma.ignoredWordForm.findMany.mockResolvedValue([]);
	});

	it('runs auto-lemma over existing corpus sentences', async () => {
		await expect(
			actions.autoLemmatize?.({
				locals: editorLocals
			} as never)
		).resolves.toEqual({
			autoLemmaSuccess: 'No automatic lemma matches found in 0 scanned sentences.'
		});

		expect(mocks.prisma.exampleSentence.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					tokens: {
						some: {
							OR: [
								{ wordId: null },
								{ AND: [{ wordId: null }, { surfaceForm: { contains: '|' } }] },
								{ segments: { some: { wordId: null } } },
								{ AND: [{ wordId: { not: null } }, { inContextTranslation: null }] }
							]
						}
					}
				}
			})
		);
	});

	it('marks a sentence as proofread', async () => {
		const formData = new FormData();
		formData.set('sentenceId', 'sentence-1');

		await actions.markProofread?.({
			request: new Request('http://localhost/admin/proofread', { method: 'POST', body: formData }),
			locals: editorLocals
		} as never);

		expect(mocks.prisma.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 'sentence-1' },
			data: {
				needsLemmaProofread: false,
				lemmaProofreadAt: expect.any(Date)
			}
		});
	});

	it('marks all visible sentence ids as proofread', async () => {
		const formData = new FormData();
		formData.set('sentenceIds', 'sentence-1, sentence-2,, ');

		await actions.markAllVisibleProofread?.({
			request: new Request('http://localhost/admin/proofread', { method: 'POST', body: formData }),
			locals: editorLocals
		} as never);

		expect(mocks.prisma.exampleSentence.updateMany).toHaveBeenCalledWith({
			where: { id: { in: ['sentence-1', 'sentence-2'] } },
			data: {
				needsLemmaProofread: false,
				lemmaProofreadAt: expect.any(Date)
			}
		});
	});
});
