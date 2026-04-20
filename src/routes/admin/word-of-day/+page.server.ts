import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import {
	ensureWordOfTheDayRange,
	getWordOfTheDaySchedule,
	setWordOfTheDay,
	WORD_OF_DAY_WINDOW_DAYS
} from '$lib/server/word-of-the-day';
import { addDays, startOfLocalDay, wordOfTheDayKey } from '$lib/word-of-the-day';
import type { Actions, PageServerLoad } from './$types';

const PAST_WINDOW_DAYS = 7;

function parseDate(input: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const candidate = new Date(Date.UTC(year, month - 1, day));
	if (
		candidate.getUTCFullYear() !== year ||
		candidate.getUTCMonth() !== month - 1 ||
		candidate.getUTCDate() !== day
	) {
		return null;
	}
	return candidate;
}

export const load: PageServerLoad = async ({ locals }) => {
	requireEditor(locals);

	const today = startOfLocalDay();
	const rangeStart = addDays(today, -PAST_WINDOW_DAYS);
	const rangeEnd = addDays(today, WORD_OF_DAY_WINDOW_DAYS);

	await ensureWordOfTheDayRange(today, rangeEnd);

	const entries = await getWordOfTheDaySchedule({ from: rangeStart, to: rangeEnd });

	const schedule = entries.map((entry) => {
		const dayKey = wordOfTheDayKey(entry.date);
		return {
			id: entry.id,
			date: entry.date,
			dayKey,
			isToday: dayKey === wordOfTheDayKey(today),
			isPast: entry.date.getTime() < today.getTime(),
			word: {
				id: entry.word.id,
				kalenjin: entry.word.kalenjin,
				translations: entry.word.translations,
				partOfSpeech: entry.word.partOfSpeech
			}
		};
	});

	const usedCount = await prisma.wordOfTheDay.count();
	const wordCount = await prisma.word.count();

	return {
		schedule,
		today,
		rangeStart,
		rangeEnd,
		usedCount,
		wordCount
	};
};

export const actions: Actions = {
	assign: async ({ request, locals }) => {
		requireEditor(locals);
		const data = await request.formData();
		const dateInput = String(data.get('date') ?? '');
		const wordId = String(data.get('wordId') ?? '').trim();

		const date = parseDate(dateInput);
		if (!date) return fail(400, { assignError: 'Invalid date.' });
		if (!wordId) return fail(400, { assignError: 'Choose a word.' });

		const word = await prisma.word.findUnique({ where: { id: wordId } });
		if (!word) return fail(400, { assignError: 'Word not found.' });

		const { affectedDates } = await setWordOfTheDay(date, wordId);

		const rows = await prisma.wordOfTheDay.findMany({
			where: { date: { in: affectedDates } },
			select: {
				id: true,
				date: true,
				word: {
					select: { id: true, kalenjin: true, translations: true, partOfSpeech: true }
				}
			}
		});

		return {
			assignSuccess: {
				message: `${word.kalenjin} is now the word for ${dateInput}.`,
				updates: rows
			}
		};
	},

	regenerate: async ({ locals }) => {
		requireEditor(locals);
		const today = startOfLocalDay();
		await ensureWordOfTheDayRange(today, addDays(today, WORD_OF_DAY_WINDOW_DAYS));
		return { regenerateSuccess: 'Missing days filled in for the next month.' };
	}
};
