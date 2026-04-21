import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, startOfLocalDay } from '$lib/word-of-the-day';

const mocks = vi.hoisted(() => {
	const prisma = {
		word: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
		wordOfTheDay: {
			findMany: vi.fn(),
			upsert: vi.fn(),
			deleteMany: vi.fn(),
			create: vi.fn(),
			count: vi.fn()
		}
	};
	const setWordOfTheDay = vi.fn();
	const ensureWordOfTheDayRange = vi.fn();
	return { prisma, setWordOfTheDay, ensureWordOfTheDayRange };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('$lib/server/word-of-the-day', () => ({
	WORD_OF_DAY_WINDOW_DAYS: 30,
	ensureWordOfTheDayRange: mocks.ensureWordOfTheDayRange,
	getWordOfTheDaySchedule: vi.fn(async () => []),
	setWordOfTheDay: mocks.setWordOfTheDay
}));

const { actions } = await import('./+page.server');

const locals = {
	user: { id: 'u1', username: 'admin', displayName: null, role: 'ADMIN' as const },
	sessionToken: 't'
};

function formRequest(payload: Record<string, string>) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(payload)) fd.set(k, v);
	return new Request('http://localhost/admin/word-of-day', { method: 'POST', body: fd });
}

async function assign(payload: Record<string, string>) {
	return actions.assign?.({ request: formRequest(payload), locals } as never);
}

describe('assign action', () => {
	beforeEach(() => {
		mocks.setWordOfTheDay.mockReset();
		mocks.prisma.word.findUnique.mockReset();
		mocks.prisma.wordOfTheDay.findMany.mockReset();
	});

	it('rejects dates before today without touching the schedule', async () => {
		const yesterday = addDays(startOfLocalDay(), -1);
		const iso = yesterday.toISOString().slice(0, 10);

		const result = (await assign({ date: iso, wordId: 'w1' })) as {
			status: number;
			data: { assignError: string };
		};

		expect(result.status).toBe(400);
		expect(result.data.assignError).toMatch(/locked/i);
		expect(mocks.setWordOfTheDay).not.toHaveBeenCalled();
		expect(mocks.prisma.word.findUnique).not.toHaveBeenCalled();
	});
});
