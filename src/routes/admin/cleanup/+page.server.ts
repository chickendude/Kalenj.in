import { fail } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import { normalizeToken } from '$lib/server/tokenize';
import type { Actions, PageServerLoad } from './$types';

const LIST_LIMIT = 100;
const IGNORED_NOTE_MAX = 200;

export const load: PageServerLoad = async ({ locals }) => {
	requireEditor(locals);

	const ignoredForms = await prisma.ignoredWordForm.findMany({
		orderBy: { normalizedForm: 'asc' },
		select: { normalizedForm: true, note: true, createdAt: true }
	});
	const ignoredNormalizedForms = ignoredForms.map((entry) => entry.normalizedForm);

	const unlinkedTokenWhere: Prisma.ExampleSentenceTokenWhereInput = {
		wordId: null,
		normalizedForm: { notIn: ignoredNormalizedForms },
		OR: [
			{ segments: { none: {} } },
			{
				segments: {
					some: {
						wordId: null,
						normalizedForm: { notIn: ignoredNormalizedForms }
					}
				}
			}
		]
	};

	const incompleteSentencesWhere: Prisma.ExampleSentenceWhereInput = {
		tokens: { some: unlinkedTokenWhere }
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
					where: unlinkedTokenWhere,
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
		incompleteSentences: {
			total: incompleteSentencesCount,
			items: incompleteSentencesShaped
		},
		missingPlurals: {
			total: missingPluralCount,
			items: missingPluralWords
		},
		ignoredForms
	};
};

export const actions: Actions = {
	addIgnore: async ({ request, locals }) => {
		requireEditor(locals);
		const data = await request.formData();
		const rawForm = String(data.get('normalizedForm') ?? '');
		const note = String(data.get('note') ?? '').trim() || null;

		const normalizedForm = normalizeToken(rawForm);
		if (!normalizedForm) {
			return fail(400, { ignoreError: 'Enter a word to ignore.' });
		}
		if (note && note.length > IGNORED_NOTE_MAX) {
			return fail(400, {
				ignoreError: `Note must be ${IGNORED_NOTE_MAX} characters or fewer.`
			});
		}

		await prisma.ignoredWordForm.upsert({
			where: { normalizedForm },
			update: { note },
			create: { normalizedForm, note }
		});

		return { ignoreSuccess: `Ignoring “${normalizedForm}”.` };
	},

	removeIgnore: async ({ request, locals }) => {
		requireEditor(locals);
		const data = await request.formData();
		const normalizedForm = String(data.get('normalizedForm') ?? '').trim();
		if (!normalizedForm) {
			return fail(400, { ignoreError: 'Missing word.' });
		}

		await prisma.ignoredWordForm.deleteMany({ where: { normalizedForm } });
		return { ignoreSuccess: `Stopped ignoring “${normalizedForm}”.` };
	}
};
