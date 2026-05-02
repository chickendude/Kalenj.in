import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import type { PageServerLoad } from './$types';

const LIST_LIMIT = 100;

export const load: PageServerLoad = async ({ locals }) => {
	requireEditor(locals);

	const incompleteSentencesWhere: Prisma.ExampleSentenceWhereInput = {
		tokens: { some: { wordId: null } }
	};

	const missingPluralWhere: Prisma.WordWhereInput = {
		partOfSpeech: { in: ['NOUN', 'ADJECTIVE'] },
		isPluralOnly: false,
		OR: [{ pluralForm: null }, { pluralForm: '' }]
	};

	const [
		incompleteSentencesCount,
		incompleteSentences,
		missingPluralCount,
		missingPluralWords
	] = await Promise.all([
		prisma.exampleSentence.count({ where: incompleteSentencesWhere }),
		prisma.exampleSentence.findMany({
			where: incompleteSentencesWhere,
			orderBy: { updatedAt: 'desc' },
			take: LIST_LIMIT,
			select: {
				id: true,
				kalenjin: true,
				english: true,
				updatedAt: true,
				_count: { select: { tokens: true } },
				tokens: {
					where: { wordId: null },
					select: { id: true }
				}
			}
		}),
		prisma.word.count({ where: missingPluralWhere }),
		prisma.word.findMany({
			where: missingPluralWhere,
			orderBy: { kalenjin: 'asc' },
			take: LIST_LIMIT,
			select: {
				id: true,
				kalenjin: true,
				translations: true,
				partOfSpeech: true,
				updatedAt: true
			}
		})
	]);

	const incompleteSentencesShaped = incompleteSentences.map((s) => ({
		id: s.id,
		kalenjin: s.kalenjin,
		english: s.english,
		updatedAt: s.updatedAt,
		totalTokens: s._count.tokens,
		unlinkedTokens: s.tokens.length
	}));

	return {
		listLimit: LIST_LIMIT,
		incompleteSentences: {
			total: incompleteSentencesCount,
			items: incompleteSentencesShaped
		},
		missingPlurals: {
			total: missingPluralCount,
			items: missingPluralWords
		}
	};
};
