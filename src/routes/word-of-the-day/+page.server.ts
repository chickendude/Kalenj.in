import {
	ensureWordOfTheDayForToday,
	getWordOfTheDayForDate,
	getWordOfTheDayHistory
} from '$lib/server/word-of-the-day';
import { startOfLocalDay } from '$lib/word-of-the-day';
import type { PageServerLoad } from './$types';

const HISTORY_PAGE_SIZE = 30;

export const load: PageServerLoad = async () => {
	await ensureWordOfTheDayForToday();
	const today = startOfLocalDay();
	const [current, history] = await Promise.all([
		getWordOfTheDayForDate(today),
		getWordOfTheDayHistory({ before: today, limit: HISTORY_PAGE_SIZE })
	]);
	return { current, history };
};
