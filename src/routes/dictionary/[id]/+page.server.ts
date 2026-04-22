import { error, fail, redirect } from '@sveltejs/kit';
import type { PartOfSpeech } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { prisma } from '$lib/server/prisma';
import { createOrUpdateLinkedWord, readPresentTenseFromFormData } from '$lib/server/lemma-words';
import { propagateKalenjinRename } from '$lib/server/propagate-rename';
import { requireEditor } from '$lib/server/guards';
import type { Actions, PageServerLoad } from './$types';

type RelatedPair = {
	word: RelatedWordSummary;
	createdAt: Date;
};

type RelatedWordSummary = {
	id: string;
	kalenjin: string;
	translations: string;
	partOfSpeech: PartOfSpeech | null;
};

function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

function relatedWordPair(wordId: string, relatedWordId: string): { wordId: string; relatedWordId: string } {
	return wordId < relatedWordId
		? { wordId, relatedWordId }
		: { wordId: relatedWordId, relatedWordId: wordId };
}

function sortRelatedWords(relatedWords: RelatedPair[]): RelatedPair[] {
	return relatedWords.sort(
		(a, b) =>
			a.word.kalenjin.localeCompare(b.word.kalenjin) ||
			a.word.translations.localeCompare(b.word.translations)
	);
}

export const load: PageServerLoad = async ({ params }) => {
	const word = await prisma.word.findUnique({
		where: { id: params.id },
		include: {
			spellings: {
				orderBy: [{ spelling: 'asc' }]
			},
			sentences: {
				include: {
					exampleSentence: {
						include: {
							tokens: {
								orderBy: { tokenOrder: 'asc' },
								include: { word: true }
							}
						}
					}
				}
			},
			relatedWords: {
				include: {
					relatedWord: {
						select: { id: true, kalenjin: true, translations: true, partOfSpeech: true }
					}
				}
			},
			relatedToWords: {
				include: {
					word: {
						select: { id: true, kalenjin: true, translations: true, partOfSpeech: true }
					}
				}
			}
		}
	});

	if (!word) {
		error(404, 'Word not found');
	}

	const relatedWords = sortRelatedWords([
		...word.relatedWords.map((link) => ({
			word: link.relatedWord,
			createdAt: link.createdAt
		})),
		...word.relatedToWords.map((link) => ({
			word: link.word,
			createdAt: link.createdAt
		}))
	]);

	return {
		word: {
			...word,
			relatedWords
		}
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		requireEditor(locals);
		const currentWord = await prisma.word.findUnique({ where: { id: params.id } });
		if (!currentWord) {
			error(404, 'Word not found');
		}

		const formData = await request.formData();
		const kalenjin = readText(formData, 'kalenjin');
		const translations = readText(formData, 'translations');
		const alternativeSpellings = readText(formData, 'alternativeSpellings');
		const notes = readText(formData, 'notes');
		const partOfSpeechRaw = readText(formData, 'partOfSpeech');
		const pluralFormRaw = readText(formData, 'pluralForm');

		const values = {
			kalenjin,
			translations,
			alternativeSpellings,
			notes,
			partOfSpeech: partOfSpeechRaw,
			pluralForm: pluralFormRaw
		};

		if (!kalenjin || !translations) {
			return fail(400, {
				error: 'Kalenjin and translations are required.',
				values
			});
		}

		if (partOfSpeechRaw && !isPartOfSpeech(partOfSpeechRaw)) {
			return fail(400, {
				error: 'Invalid part of speech value.',
				values
			});
		}

		const partOfSpeech: PartOfSpeech | null = partOfSpeechRaw
			? (partOfSpeechRaw as PartOfSpeech)
			: null;

		const pluralForm =
			(partOfSpeech === 'NOUN' || partOfSpeech === 'ADJECTIVE') && pluralFormRaw
				? pluralFormRaw
				: null;

		const presentTense =
			partOfSpeech === 'VERB' ? readPresentTenseFromFormData(formData) : null;

		await prisma.$transaction(async (tx) => {
			await createOrUpdateLinkedWord(tx, {
				wordId: params.id,
				kalenjin,
				translations,
				notes: notes || null,
				alternativeSpellings,
				partOfSpeech,
				pluralForm,
				presentTense
			});

			if (kalenjin !== currentWord.kalenjin) {
				await propagateKalenjinRename(tx, params.id, kalenjin);
			}
		});

		return { success: true };
	},
	delete: async ({ params, locals }) => {
		requireEditor(locals);
		await prisma.word.delete({ where: { id: params.id } });
		redirect(303, '/dictionary');
	},
	addRelatedWord: async ({ request, params, locals }) => {
		requireEditor(locals);
		const formData = await request.formData();
		const relatedWordId = readText(formData, 'relatedWordId');

		if (!relatedWordId) {
			return fail(400, { relatedWordError: 'Choose a word to link.' });
		}

		if (relatedWordId === params.id) {
			return fail(400, { relatedWordError: 'A word cannot be related to itself.' });
		}

		const [currentWord, relatedWord] = await Promise.all([
			prisma.word.findUnique({
				where: { id: params.id },
				select: { id: true }
			}),
			prisma.word.findUnique({
				where: { id: relatedWordId },
				select: { id: true }
			})
		]);

		if (!currentWord) {
			error(404, 'Word not found');
		}
		if (!relatedWord) {
			return fail(404, { relatedWordError: 'Related word not found.' });
		}

		await prisma.relatedWord.createMany({
			data: [relatedWordPair(params.id, relatedWordId)],
			skipDuplicates: true
		});

		return { relatedWordSuccess: true };
	},
	removeRelatedWord: async ({ request, params, locals }) => {
		requireEditor(locals);
		const formData = await request.formData();
		const relatedWordId = readText(formData, 'relatedWordId');

		if (!relatedWordId) {
			return fail(400, { relatedWordError: 'Choose a word to remove.' });
		}

		await prisma.relatedWord.deleteMany({
			where: relatedWordPair(params.id, relatedWordId)
		});

		return { relatedWordSuccess: true };
	}
};
