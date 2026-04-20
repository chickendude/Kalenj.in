import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		wordOfTheDay: {
			upsert: vi.fn(),
			findMany: vi.fn(),
			deleteMany: vi.fn(),
			create: vi.fn()
		},
		word: {
			findMany: vi.fn()
		}
	};
	return { prisma };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

const { setWordOfTheDay } = await import('./word-of-the-day');

function resetMocks() {
	for (const model of [mocks.prisma.wordOfTheDay, mocks.prisma.word]) {
		for (const fn of Object.values(model)) fn.mockReset();
	}
}

describe('setWordOfTheDay duplicate dedupe', () => {
	beforeEach(() => {
		resetMocks();
		mocks.prisma.wordOfTheDay.upsert.mockResolvedValue({});
		mocks.prisma.wordOfTheDay.findMany.mockResolvedValue([]);
		mocks.prisma.word.findMany.mockResolvedValue([]);
	});

	it('only searches strictly-future duplicates, sparing today and past', async () => {
		const future = new Date();
		future.setUTCHours(0, 0, 0, 0);
		future.setUTCDate(future.getUTCDate() + 3);

		await setWordOfTheDay(future, 'w1');

		expect(mocks.prisma.wordOfTheDay.findMany).toHaveBeenCalledTimes(1);
		const where = mocks.prisma.wordOfTheDay.findMany.mock.calls[0][0].where;
		expect(where.wordId).toBe('w1');
		expect(where.date).toHaveProperty('gt');
		expect(where.date).not.toHaveProperty('gte');
	});

	it('does not delete when there are no future duplicates', async () => {
		const future = new Date();
		future.setUTCHours(0, 0, 0, 0);
		future.setUTCDate(future.getUTCDate() + 3);

		const result = await setWordOfTheDay(future, 'w1');

		expect(mocks.prisma.wordOfTheDay.deleteMany).not.toHaveBeenCalled();
		expect(result.affectedDates).toHaveLength(1);
	});

	it('deletes future duplicates when they exist', async () => {
		const target = new Date();
		target.setUTCHours(0, 0, 0, 0);
		target.setUTCDate(target.getUTCDate() + 3);

		const duplicate = new Date(target);
		duplicate.setUTCDate(duplicate.getUTCDate() + 4);

		mocks.prisma.wordOfTheDay.findMany
			.mockResolvedValueOnce([{ id: 'dup1', date: duplicate }])
			.mockResolvedValueOnce([]);
		mocks.prisma.word.findMany.mockResolvedValue([]);

		const result = await setWordOfTheDay(target, 'w1');

		expect(mocks.prisma.wordOfTheDay.deleteMany).toHaveBeenCalledWith({
			where: { id: { in: ['dup1'] } }
		});
		expect(result.affectedDates).toHaveLength(2);
	});
});
