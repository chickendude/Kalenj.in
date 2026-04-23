import { fail, redirect } from '@sveltejs/kit';
import type { PartOfSpeech } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { prisma } from '$lib/server/prisma';
import { searchWordsByKalenjin } from '$lib/server/kalenjin-word-search';
import { createOrUpdateLinkedWord, readPresentTenseFromFormData } from '$lib/server/lemma-words';
import { requireEditor } from '$lib/server/guards';
import { deleteUploadedImage, saveUploadedImage, UploadError } from '$lib/server/uploads';
import type { Actions, PageServerLoad } from './$types';

function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

type SearchLanguage = 'both' | 'translations' | 'kalenjin';

function parseLanguage(value: string | null): SearchLanguage {
	if (value === 'both' || value === 'translations' || value === 'kalenjin') {
		return value;
	}

	return 'kalenjin';
}

function filterByPartOfSpeech<T extends { partOfSpeech: PartOfSpeech | null }>(
	words: T[],
	partOfSpeech: PartOfSpeech | null
): T[] {
	if (!partOfSpeech) {
		return words;
	}

	return words.filter((word) => word.partOfSpeech === partOfSpeech);
}

export const load: PageServerLoad = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	const language = parseLanguage(url.searchParams.get('lang'));
	const posParam = url.searchParams.get('pos') ?? '';
	const pos = isPartOfSpeech(posParam) ? posParam : null;
	const limit = 200;

	let words;
	if (!query) {
		words = await prisma.word.findMany({
			where: pos ? { partOfSpeech: pos } : undefined,
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: limit
		});
	} else if (language === 'translations') {
		words = await prisma.word.findMany({
			where: {
				...(pos ? { partOfSpeech: pos } : {}),
				translations: { contains: query, mode: 'insensitive' }
			},
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: limit
		});
	} else if (language === 'kalenjin') {
		words = filterByPartOfSpeech(await searchWordsByKalenjin(prisma, query, limit), pos);
	} else {
		const [kalenjinWords, translationWords] = await Promise.all([
			searchWordsByKalenjin(prisma, query, limit),
			prisma.word.findMany({
				where: {
					...(pos ? { partOfSpeech: pos } : {}),
					translations: { contains: query, mode: 'insensitive' }
				},
				orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
				take: limit
			})
		]);

		const mergedWords = new Map<string, (typeof translationWords)[number]>();
		for (const word of filterByPartOfSpeech(kalenjinWords, pos)) {
			mergedWords.set(word.id, word);
		}
		for (const word of translationWords) {
			if (!mergedWords.has(word.id)) {
				mergedWords.set(word.id, word);
			}
		}

		words = [...mergedWords.values()].slice(0, limit);
	}

	const totalCount = await prisma.word.count();

	return { query, language, pos: posParam, words, totalCount };
};

export const actions: Actions = {
	createWord: async ({ request, locals }) => {
		requireEditor(locals);
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

		const imageFile = formData.get('image');
		let imageUrl: string | null = null;
		if (imageFile instanceof File && imageFile.size > 0) {
			try {
				imageUrl = await saveUploadedImage(imageFile);
			} catch (err) {
				if (err instanceof UploadError) {
					return fail(400, { error: err.message, values });
				}
				throw err;
			}
		}

		let word;
		try {
			word = await prisma.$transaction((tx) =>
				createOrUpdateLinkedWord(tx, {
					kalenjin,
					translations,
					notes: notes || null,
					alternativeSpellings,
					partOfSpeech,
					pluralForm,
					presentTense,
					imageUrl
				})
			);
		} catch (err) {
			if (imageUrl) {
				await deleteUploadedImage(imageUrl);
			}
			throw err;
		}

		redirect(303, `/dictionary/${word.id}`);
	}
};
