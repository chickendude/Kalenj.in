import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		exampleSentence: {
			count: vi.fn(),
			findMany: vi.fn()
		},
		word: {
			count: vi.fn(),
			findMany: vi.fn()
		}
	};
	return { prisma };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

const { load } = await import('./+page.server');

type Role = 'ADMIN' | 'MANAGER';
type Locals = {
	user: { id: string; username: string; displayName: null; role: Role } | null;
	sessionToken: string | null;
};

const adminLocals: Locals = {
	user: { id: 'u1', username: 'admin', displayName: null, role: 'ADMIN' },
	sessionToken: 't'
};
const editorLocals: Locals = {
	user: { id: 'u2', username: 'editor', displayName: null, role: 'MANAGER' },
	sessionToken: 't'
};

type LoaderResult = Exclude<Awaited<ReturnType<typeof load>>, void>;

async function call(locals: Locals): Promise<LoaderResult> {
	const result = await load({ locals } as never);
	if (!result) throw new Error('loader returned void');
	return result as LoaderResult;
}

describe('cleanup page loader — auth', () => {
	beforeEach(() => {
		mocks.prisma.exampleSentence.count.mockResolvedValue(0);
		mocks.prisma.exampleSentence.findMany.mockResolvedValue([]);
		mocks.prisma.word.count.mockResolvedValue(0);
		mocks.prisma.word.findMany.mockResolvedValue([]);
	});

	it('rejects anonymous requests with a 404 (does not leak the route)', async () => {
		await expect(call({ user: null, sessionToken: null })).rejects.toMatchObject({
			status: 404
		});
		expect(mocks.prisma.exampleSentence.count).not.toHaveBeenCalled();
	});

	it('allows MANAGER as well as ADMIN', async () => {
		await expect(call(editorLocals)).resolves.toBeDefined();
		await expect(call(adminLocals)).resolves.toBeDefined();
	});
});

describe('cleanup page loader — query shapes', () => {
	beforeEach(() => {
		mocks.prisma.exampleSentence.count.mockReset();
		mocks.prisma.exampleSentence.findMany.mockReset();
		mocks.prisma.word.count.mockReset();
		mocks.prisma.word.findMany.mockReset();
		mocks.prisma.exampleSentence.count.mockResolvedValue(0);
		mocks.prisma.exampleSentence.findMany.mockResolvedValue([]);
		mocks.prisma.word.count.mockResolvedValue(0);
		mocks.prisma.word.findMany.mockResolvedValue([]);
	});

	it('queries sentences whose tokens contain at least one unlinked token', async () => {
		await call(adminLocals);
		const expectedWhere = { tokens: { some: { wordId: null } } };
		expect(mocks.prisma.exampleSentence.count).toHaveBeenCalledWith({ where: expectedWhere });
		expect(mocks.prisma.exampleSentence.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expectedWhere,
				orderBy: { updatedAt: 'desc' }
			})
		);
	});

	it('queries nouns/adjectives that have no plural form and are not plural-only', async () => {
		await call(adminLocals);
		const expectedWhere = {
			partOfSpeech: { in: ['NOUN', 'ADJECTIVE'] },
			isPluralOnly: false,
			OR: [{ pluralForm: null }, { pluralForm: '' }]
		};
		expect(mocks.prisma.word.count).toHaveBeenCalledWith({ where: expectedWhere });
		expect(mocks.prisma.word.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expectedWhere,
				orderBy: { kalenjin: 'asc' }
			})
		);
	});

	it('limits each list to 100 rows', async () => {
		await call(adminLocals);
		expect(mocks.prisma.exampleSentence.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ take: 100 })
		);
		expect(mocks.prisma.word.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ take: 100 })
		);
	});
});

describe('cleanup page loader — output shape', () => {
	it('exposes the unlinked-token count and total-token count per sentence', async () => {
		mocks.prisma.exampleSentence.count.mockResolvedValue(2);
		mocks.prisma.exampleSentence.findMany.mockResolvedValue([
			{
				id: 's1',
				kalenjin: 'Chamgei.',
				english: 'Hello.',
				updatedAt: new Date('2026-04-22T00:00:00Z'),
				_count: { tokens: 1 },
				tokens: [{ id: 't1' }]
			},
			{
				id: 's2',
				kalenjin: 'Iyo, sis.',
				english: 'Yes, child.',
				updatedAt: new Date('2026-04-21T00:00:00Z'),
				_count: { tokens: 3 },
				tokens: [{ id: 't2' }, { id: 't3' }]
			}
		]);
		mocks.prisma.word.count.mockResolvedValue(0);
		mocks.prisma.word.findMany.mockResolvedValue([]);

		const result = await call(adminLocals);

		expect(result.incompleteSentences.total).toBe(2);
		expect(result.incompleteSentences.items).toEqual([
			{
				id: 's1',
				kalenjin: 'Chamgei.',
				english: 'Hello.',
				updatedAt: new Date('2026-04-22T00:00:00Z'),
				totalTokens: 1,
				unlinkedTokens: 1
			},
			{
				id: 's2',
				kalenjin: 'Iyo, sis.',
				english: 'Yes, child.',
				updatedAt: new Date('2026-04-21T00:00:00Z'),
				totalTokens: 3,
				unlinkedTokens: 2
			}
		]);
	});

	it('passes through the missing-plural words unchanged plus the total count', async () => {
		mocks.prisma.exampleSentence.count.mockResolvedValue(0);
		mocks.prisma.exampleSentence.findMany.mockResolvedValue([]);
		mocks.prisma.word.count.mockResolvedValue(7);
		mocks.prisma.word.findMany.mockResolvedValue([
			{
				id: 'w1',
				kalenjin: 'maiwek',
				translations: 'beer, alcohol',
				partOfSpeech: 'NOUN',
				updatedAt: new Date('2026-04-22T00:00:00Z')
			}
		]);

		const result = await call(adminLocals);

		expect(result.missingPlurals.total).toBe(7);
		expect(result.missingPlurals.items).toHaveLength(1);
		expect(result.missingPlurals.items[0]).toMatchObject({
			id: 'w1',
			kalenjin: 'maiwek',
			partOfSpeech: 'NOUN'
		});
	});
});
