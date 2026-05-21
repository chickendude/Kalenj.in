import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	prisma: { cefrEnglishTarget: { findMany: vi.fn() } }
}));

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

const { loadCefrBrowse, parseCefrSortOption } = await import('./cefr-browse');

type FakeTarget = { english: string; coveredByLessonWord: unknown };

function target(english: string, covered = false): FakeTarget {
	return { english, coveredByLessonWord: covered ? { id: 'lw' } : null };
}

function load(params: Record<string, string>) {
	return loadCefrBrowse(new URLSearchParams(params), 'A1' as never);
}

beforeEach(() => {
	mocks.prisma.cefrEnglishTarget.findMany.mockReset();
});

describe('parseCefrSortOption', () => {
	it('returns alpha-desc only for the explicit value, else alpha-asc', () => {
		expect(parseCefrSortOption('alpha-desc')).toBe('alpha-desc');
		expect(parseCefrSortOption('alpha-asc')).toBe('alpha-asc');
		expect(parseCefrSortOption('garbage')).toBe('alpha-asc');
		expect(parseCefrSortOption(null)).toBe('alpha-asc');
	});
});

describe('loadCefrBrowse', () => {
	it('returns totals and coverage counts', async () => {
		mocks.prisma.cefrEnglishTarget.findMany.mockResolvedValue([
			target('to eat (verb)', true),
			target('water (noun)', false),
			target('big (adjective)', true)
		]);

		const data = await load({});

		expect(data.totalCount).toBe(3);
		expect(data.coveredCount).toBe(2);
		expect(data.targets).toHaveLength(3);
		expect(data.page).toBe(1);
	});

	it('filters by case-insensitive query', async () => {
		mocks.prisma.cefrEnglishTarget.findMany.mockResolvedValue([
			target('to eat'),
			target('water'),
			target('to drink')
		]);

		const data = await load({ q: 'TO ' });

		expect(data.filteredCount).toBe(2);
		expect(data.targets.map((t) => t.english)).toEqual(['to eat', 'to drink']);
	});

	it('filters by coverage', async () => {
		mocks.prisma.cefrEnglishTarget.findMany.mockResolvedValue([
			target('a', true),
			target('b', false),
			target('c', true)
		]);

		expect((await load({ covered: 'covered' })).filteredCount).toBe(2);
		expect((await load({ covered: 'uncovered' })).filteredCount).toBe(1);
		expect((await load({ covered: 'all' })).filteredCount).toBe(3);
	});

	it('builds POS option counts from the parenthetical tokens and filters by them', async () => {
		mocks.prisma.cefrEnglishTarget.findMany.mockResolvedValue([
			target('to eat (verb)'),
			target('to run (verb)'),
			target('water (noun)'),
			target('plain word')
		]);

		const data = await load({});
		expect(data.posOptions).toEqual([
			{ token: 'verb', count: 2 },
			{ token: 'noun', count: 1 }
		]);

		const verbs = await load({ pos: 'verb' });
		expect(verbs.filteredCount).toBe(2);
	});

	it('matches POS token (none) for targets without a parenthetical', async () => {
		mocks.prisma.cefrEnglishTarget.findMany.mockResolvedValue([
			target('to eat (verb)'),
			target('plain word')
		]);

		const data = await load({ pos: '(none)' });
		expect(data.filteredCount).toBe(1);
		expect(data.targets[0].english).toBe('plain word');
	});

	it('clamps an out-of-range page to the last available page', async () => {
		mocks.prisma.cefrEnglishTarget.findMany.mockResolvedValue([target('only one')]);

		const data = await load({ page: '99' });
		expect(data.totalPages).toBe(1);
		expect(data.page).toBe(1);
	});
});
