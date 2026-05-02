import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		word: {
			count: vi.fn().mockResolvedValue(0),
			findFirst: vi.fn().mockResolvedValue(null)
		},
		exampleSentence: {
			count: vi.fn().mockResolvedValue(0),
			findFirst: vi.fn().mockResolvedValue(null)
		},
		$queryRawUnsafe: vi.fn().mockResolvedValue([])
	};
	return { prisma };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

const { load } = await import('./+page.server');

type LoaderResult = Exclude<Awaited<ReturnType<typeof load>>, void>;

async function call(search: string): Promise<LoaderResult> {
	const result = await load({ url: new URL(`http://localhost/stats${search}`) } as never);
	if (!result) throw new Error('loader returned void');
	return result as LoaderResult;
}

describe('stats page loader — metrics defaulting', () => {
	beforeEach(() => {
		mocks.prisma.word.count.mockResolvedValue(0);
		mocks.prisma.exampleSentence.count.mockResolvedValue(0);
		mocks.prisma.$queryRawUnsafe.mockResolvedValue([]);
	});

	it('defaults to all metrics when neither f nor metrics are present', async () => {
		const result = await call('');
		expect(result.selectedMetrics.sort()).toEqual(
			['cumulativeSentences', 'cumulativeWords', 'sentencesCreated', 'wordsCreated'].sort()
		);
	});

	it('defaults to all metrics on a direct URL with range but no metrics (no f marker)', async () => {
		// Reproduces the bug: a user navigating directly to ?range=allTime should still
		// see all metrics, not zero.
		const result = await call('?range=allTime');
		expect(result.selectedMetrics).toHaveLength(4);
	});

	it('respects the metrics list when f=1 is present (form submission)', async () => {
		const result = await call('?f=1&range=thisYear&metrics=wordsCreated&metrics=cumulativeWords');
		expect(result.selectedMetrics.sort()).toEqual(['cumulativeWords', 'wordsCreated']);
	});

	it('honors an explicit empty selection when f=1 is present', async () => {
		// User unchecks all metrics → form posts f=1 with no metrics → server returns []
		const result = await call('?f=1&range=thisYear');
		expect(result.selectedMetrics).toEqual([]);
	});

	it('drops unknown metric values that arrive in the URL', async () => {
		const result = await call('?f=1&metrics=wordsCreated&metrics=bogusMetric');
		expect(result.selectedMetrics).toEqual(['wordsCreated']);
	});
});

describe('stats page loader — range and pagination', () => {
	beforeEach(() => {
		mocks.prisma.word.count.mockResolvedValue(0);
		mocks.prisma.exampleSentence.count.mockResolvedValue(0);
		mocks.prisma.$queryRawUnsafe.mockResolvedValue([]);
	});

	it('defaults to past30Days when no range is given', async () => {
		const result = await call('');
		expect(result.range).toBe('past30Days');
	});

	it('falls back to past30Days when an unknown range is given', async () => {
		const result = await call('?range=lastDecade');
		expect(result.range).toBe('past30Days');
	});

	it('parses a valid range from the URL', async () => {
		const result = await call('?range=thisYear');
		expect(result.range).toBe('thisYear');
	});

	it('defaults page to 1 and rejects non-numeric / negative values', async () => {
		expect((await call('')).page).toBe(1);
		expect((await call('?page=abc')).page).toBe(1);
		expect((await call('?page=-5')).page).toBe(1);
		expect((await call('?page=0')).page).toBe(1);
	});

	it('parses a valid positive page number', async () => {
		expect((await call('?page=3')).page).toBe(3);
	});
});
