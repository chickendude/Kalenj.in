import { error, fail, redirect } from '@sveltejs/kit';
import type { PartOfSpeech } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { combinePluralFormVariants } from '$lib/plural-form-variants';
import { prisma } from '$lib/server/prisma';
import { createOrUpdateLinkedWord, readPresentTenseFromFormData } from '$lib/server/lemma-words';
import { propagateKalenjinRename } from '$lib/server/propagate-rename';
import { requireEditor } from '$lib/server/guards';
import { deleteUploadedImage, saveUploadedImage, UploadError } from '$lib/server/uploads';
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
		const isPluralOnlyRaw = readText(formData, 'isPluralOnly');
		const alternativePluralForms = readText(formData, 'alternativePluralForms');

		const values = {
			kalenjin,
			translations,
			alternativeSpellings,
			notes,
			partOfSpeech: partOfSpeechRaw,
			pluralForm: pluralFormRaw,
			isPluralOnly: isPluralOnlyRaw === 'on',
			alternativePluralForms
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

		const canHavePlural = partOfSpeech === 'NOUN' || partOfSpeech === 'ADJECTIVE';
		const isPluralOnly = canHavePlural && isPluralOnlyRaw === 'on';
		const combinedPluralForms = combinePluralFormVariants(pluralFormRaw, alternativePluralForms);
		const pluralForm =
			canHavePlural && !isPluralOnly && combinedPluralForms
				? combinedPluralForms
				: null;

		const presentTense =
			partOfSpeech === 'VERB' ? readPresentTenseFromFormData(formData) : null;

		const imageFile = formData.get('image');
		const removeImage = formData.get('removeImage') === '1';
		let newImageUrl: string | null | undefined = undefined;
		if (imageFile instanceof File && imageFile.size > 0) {
			try {
				newImageUrl = await saveUploadedImage(imageFile);
			} catch (err) {
				if (err instanceof UploadError) {
					return fail(400, { error: err.message, values });
				}
				throw err;
			}
		} else if (removeImage) {
			newImageUrl = null;
		}

		try {
			await prisma.$transaction(async (tx) => {
				await createOrUpdateLinkedWord(tx, {
					wordId: params.id,
					kalenjin,
					translations,
					notes: notes || null,
					alternativeSpellings,
					partOfSpeech,
					pluralForm,
					isPluralOnly,
					presentTense,
					imageUrl: newImageUrl
				});

				if (kalenjin !== currentWord.kalenjin) {
					await propagateKalenjinRename(tx, params.id, kalenjin);
				}
			});
		} catch (err) {
			if (typeof newImageUrl === 'string') await deleteUploadedImage(newImageUrl);
			throw err;
		}

		if (newImageUrl !== undefined && currentWord.imageUrl && currentWord.imageUrl !== newImageUrl) {
			await deleteUploadedImage(currentWord.imageUrl);
		}

		return { success: true };
	},
	delete: async ({ params, locals }) => {
		requireEditor(locals);
		const existing = await prisma.word.findUnique({
			where: { id: params.id },
			select: { imageUrl: true }
		});
		await prisma.word.delete({ where: { id: params.id } });
		if (existing?.imageUrl) await deleteUploadedImage(existing.imageUrl);
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
