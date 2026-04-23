import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/prisma';
import {
	ensureWordOfTheDayForToday,
	getWordOfTheDayForDate
} from '$lib/server/word-of-the-day';
import { startOfLocalDay } from '$lib/word-of-the-day';
import type { PageServerLoad } from './$types';

const recentSentenceInclude = {
	tokens: {
		orderBy: { tokenOrder: 'asc' },
		include: {
			word: { select: { id: true, kalenjin: true, translations: true, audioUrl: true } },
			segments: {
				orderBy: { segmentOrder: 'asc' },
				include: {
					word: { select: { id: true, kalenjin: true, translations: true, audioUrl: true } }
				}
			}
		}
	}
} satisfies Prisma.ExampleSentenceInclude;

async function loadWordOfTheDay() {
	await ensureWordOfTheDayForToday();
	const entry = await getWordOfTheDayForDate(startOfLocalDay());
	return entry?.word ?? null;
}

export const load: PageServerLoad = async () => {
	const [wordCount, sentenceCount, recentWords, recentSentences, wordOfDay] = await Promise.all([
		prisma.word.count(),
		prisma.exampleSentence.count(),
		prisma.word.findMany({
			orderBy: { createdAt: 'desc' },
			take: 6,
			select: {
				id: true,
				kalenjin: true,
				translations: true,
				partOfSpeech: true,
				audioUrl: true
			}
		}),
		prisma.exampleSentence.findMany({
			orderBy: { createdAt: 'desc' },
			take: 5,
			include: recentSentenceInclude
		}),
		loadWordOfTheDay()
	]);

	return {
		wordCount,
		sentenceCount,
		recentWords,
		recentSentences,
		wordOfDay
	};
};
