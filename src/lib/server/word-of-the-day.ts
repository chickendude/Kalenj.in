import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/prisma';
import {
	addDays,
	eachDay,
	pickWordOfTheDayIndex,
	startOfLocalDay,
	wordOfTheDayKey
} from '$lib/word-of-the-day';

export const WORD_OF_DAY_WINDOW_DAYS = 30;

export const wordOfDayInclude = {
	word: {
		include: {
			spellings: { orderBy: { spelling: 'asc' } },
			sentences: {
				take: 1,
				include: {
					exampleSentence: {
						include: {
							tokens: {
								orderBy: { tokenOrder: 'asc' },
								include: {
									word: { select: { id: true, kalenjin: true, translations: true } },
									segments: {
										orderBy: { segmentOrder: 'asc' },
										include: {
											word: { select: { id: true, kalenjin: true, translations: true } }
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}
} satisfies Prisma.WordOfTheDayInclude;

export type WordOfDayWithWord = Prisma.WordOfTheDayGetPayload<{ include: typeof wordOfDayInclude }>;

async function loadCandidatePool(): Promise<string[]> {
	const withExamples = await prisma.word.findMany({
		where: { sentences: { some: {} } },
		select: { id: true },
		orderBy: { id: 'asc' }
	});
	if (withExamples.length > 0) return withExamples.map((w) => w.id);

	const all = await prisma.word.findMany({
		select: { id: true },
		orderBy: { id: 'asc' }
	});
	return all.map((w) => w.id);
}

export async function ensureWordOfTheDayRange(from: Date, to: Date): Promise<void> {
	const days = eachDay(from, to);
	if (days.length === 0) return;

	const pool = await loadCandidatePool();
	if (pool.length === 0) return;

	const existing = await prisma.wordOfTheDay.findMany({
		where: { date: { gte: startOfLocalDay(from), lte: startOfLocalDay(to) } },
		select: { date: true }
	});
	const existingKeys = new Set(existing.map((e) => wordOfTheDayKey(e.date)));
	const missing = days.filter((d) => !existingKeys.has(wordOfTheDayKey(d)));
	if (missing.length === 0) return;

	const priorUsed = await prisma.wordOfTheDay.findMany({ select: { wordId: true } });
	const usedIds = new Set(priorUsed.map((r) => r.wordId));

	for (const day of missing) {
		let candidates = pool.filter((id) => !usedIds.has(id));
		if (candidates.length === 0) {
			// Pool exhausted — reset so we can cycle again rather than block.
			usedIds.clear();
			candidates = pool.slice();
		}
		const index = pickWordOfTheDayIndex(wordOfTheDayKey(day), candidates.length);
		const chosenId = candidates[index];
		try {
			await prisma.wordOfTheDay.create({
				data: { date: day, wordId: chosenId }
			});
			usedIds.add(chosenId);
		} catch {
			// Unique violation on `date` — another request got there first. Skip.
		}
	}
}

export async function ensureWordOfTheDayForToday(): Promise<void> {
	const today = startOfLocalDay();
	await ensureWordOfTheDayRange(today, addDays(today, WORD_OF_DAY_WINDOW_DAYS));
}

export async function getWordOfTheDayForDate(date: Date): Promise<WordOfDayWithWord | null> {
	return prisma.wordOfTheDay.findUnique({
		where: { date: startOfLocalDay(date) },
		include: wordOfDayInclude
	});
}

export async function getWordOfTheDayHistory({
	before,
	limit
}: {
	before: Date;
	limit: number;
}): Promise<WordOfDayWithWord[]> {
	return prisma.wordOfTheDay.findMany({
		where: { date: { lt: startOfLocalDay(before) } },
		orderBy: { date: 'desc' },
		take: limit,
		include: wordOfDayInclude
	});
}

export async function getWordOfTheDaySchedule({
	from,
	to
}: {
	from: Date;
	to: Date;
}): Promise<WordOfDayWithWord[]> {
	return prisma.wordOfTheDay.findMany({
		where: { date: { gte: startOfLocalDay(from), lte: startOfLocalDay(to) } },
		orderBy: { date: 'asc' },
		include: wordOfDayInclude
	});
}

export async function setWordOfTheDay(
	date: Date,
	wordId: string
): Promise<{ affectedDates: Date[] }> {
	const day = startOfLocalDay(date);
	const today = startOfLocalDay();

	await prisma.wordOfTheDay.upsert({
		where: { date: day },
		create: { date: day, wordId },
		update: { wordId }
	});

	const duplicates = await prisma.wordOfTheDay.findMany({
		where: {
			wordId,
			date: { gt: today, not: day }
		},
		select: { id: true, date: true },
		orderBy: { date: 'asc' }
	});
	if (duplicates.length === 0) return { affectedDates: [day] };

	await prisma.wordOfTheDay.deleteMany({
		where: { id: { in: duplicates.map((d) => d.id) } }
	});

	const minDate = duplicates[0].date;
	const maxDate = duplicates[duplicates.length - 1].date;
	await ensureWordOfTheDayRange(minDate, maxDate);

	return { affectedDates: [day, ...duplicates.map((d) => d.date)] };
}

export async function getLastUsedMap(
	wordIds: string[]
): Promise<Map<string, { date: Date; isFuture: boolean }>> {
	if (wordIds.length === 0) return new Map();
	const today = startOfLocalDay();
	const rows = await prisma.wordOfTheDay.findMany({
		where: { wordId: { in: wordIds } },
		select: { wordId: true, date: true },
		orderBy: { date: 'desc' }
	});
	const out = new Map<string, { date: Date; isFuture: boolean }>();
	for (const row of rows) {
		if (!out.has(row.wordId)) {
			out.set(row.wordId, { date: row.date, isFuture: row.date.getTime() > today.getTime() });
		}
	}
	return out;
}
