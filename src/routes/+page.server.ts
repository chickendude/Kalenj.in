import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/prisma';
import { pickWordOfTheDayIndex, wordOfTheDayKey } from '$lib/word-of-the-day';
import type { PageServerLoad } from './$types';

const recentSentenceInclude = {
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
} satisfies Prisma.ExampleSentenceInclude;

async function loadWordOfTheDay() {
	const [countWithExample, totalCount] = await Promise.all([
		prisma.word.count({ where: { sentences: { some: {} } } }),
		prisma.word.count()
	]);

	if (totalCount === 0) {
		return null;
	}

	const usePool = countWithExample > 0;
	const poolSize = usePool ? countWithExample : totalCount;
	const index = pickWordOfTheDayIndex(wordOfTheDayKey(), poolSize);

	const word = await prisma.word.findFirst({
		where: usePool ? { sentences: { some: {} } } : undefined,
		orderBy: { id: 'asc' },
		skip: index,
		include: {
			spellings: { orderBy: { spelling: 'asc' } },
			sentences: {
				take: 1,
				include: {
					exampleSentence: { include: recentSentenceInclude }
				}
			}
		}
	});

	return word;
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
				partOfSpeech: true
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
