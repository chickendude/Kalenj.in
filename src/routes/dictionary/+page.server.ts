import { fail, redirect } from '@sveltejs/kit';
import type { PartOfSpeech, Prisma } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import {
	isNumericTranslationSearchQuery,
	sortTranslationSearchResults
} from '$lib/translations';
import { combinePluralFormVariants } from '$lib/plural-form-variants';
import { prisma } from '$lib/server/prisma';
import { searchWordsByKalenjin } from '$lib/server/kalenjin-word-search';
import { createOrUpdateLinkedWord, readPresentTenseFromFormData } from '$lib/server/lemma-words';
import { requireEditor } from '$lib/server/guards';
import { deleteUploadedImage, saveUploadedImage, UploadError } from '$lib/server/uploads';
import { relatedWordPair } from '$lib/server/related-words';
import {
	filterByPartOfSpeech,
	matchesMissing,
	missingWhereClause,
	parseMissing
} from '$lib/server/word-filters';
import type { Actions, PageServerLoad } from './$types';

function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

type SearchLanguage = 'both' | 'translations' | 'kalenjin';
type DictionarySearchWord = {
	id: string;
	kalenjin: string;
	translations: string;
	partOfSpeech: PartOfSpeech | null;
	audioUrl: string | null;
};

function parseLanguage(value: string | null): SearchLanguage {
	if (value === 'both' || value === 'translations' || value === 'kalenjin') {
		return value;
	}

	return 'kalenjin';
}

export const load: PageServerLoad = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	const language = parseLanguage(url.searchParams.get('lang'));
	const posParam = url.searchParams.get('pos') ?? '';
	const pos = isPartOfSpeech(posParam) ? posParam : null;
	const missing = parseMissing(url.searchParams.get('missing'));
	const missingWhere = missingWhereClause(missing);
	const limit = 200;
	const prioritizeTranslations = isNumericTranslationSearchQuery(query);
	const posWhere: Prisma.WordWhereInput | null = pos ? { partOfSpeech: pos } : null;
	const baseWhere: Prisma.WordWhereInput | undefined =
		posWhere && missingWhere
			? { AND: [posWhere, missingWhere] }
			: posWhere ?? missingWhere ?? undefined;

	let words: DictionarySearchWord[];
	if (!query) {
		words = await prisma.word.findMany({
			where: baseWhere,
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			select: { id: true, kalenjin: true, translations: true, partOfSpeech: true, audioUrl: true },
			take: limit
		});
	} else if (language === 'translations') {
		const translationWords = await prisma.word.findMany({
			where: {
				AND: [
					{ translations: { contains: query, mode: 'insensitive' } },
					...(baseWhere ? [baseWhere] : [])
				]
			},
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			select: { id: true, kalenjin: true, translations: true, partOfSpeech: true, audioUrl: true },
			take: limit
		});

		words = prioritizeTranslations
			? sortTranslationSearchResults(translationWords, query).slice(0, limit)
			: translationWords;
	} else if (language === 'kalenjin') {
		const searched = await searchWordsByKalenjin(prisma, query, limit);
		const posFiltered = filterByPartOfSpeech(searched, pos);
		words = missing ? posFiltered.filter((word) => matchesMissing(word, missing)) : posFiltered;
	} else {
		const [kalenjinWords, translationWords] = await Promise.all([
			searchWordsByKalenjin(prisma, query, limit),
			prisma.word.findMany({
				where: {
					AND: [
						{ translations: { contains: query, mode: 'insensitive' } },
						...(baseWhere ? [baseWhere] : [])
					]
				},
				orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
				select: { id: true, kalenjin: true, translations: true, partOfSpeech: true, audioUrl: true },
				take: limit
			})
		]);

		const filteredKalenjin = filterByPartOfSpeech(kalenjinWords, pos).filter((word) =>
			matchesMissing(word, missing)
		);
		const rankedTranslationWords = prioritizeTranslations
			? sortTranslationSearchResults(translationWords, query)
			: translationWords;
		const mergedWords = new Map<string, DictionarySearchWord>();
		const firstPassWords = prioritizeTranslations ? rankedTranslationWords : filteredKalenjin;
		const secondPassWords = prioritizeTranslations ? filteredKalenjin : rankedTranslationWords;

		for (const word of firstPassWords) {
			mergedWords.set(word.id, word);
		}
		for (const word of secondPassWords) {
			if (!mergedWords.has(word.id)) {
				mergedWords.set(word.id, word);
			}
		}

		words = [...mergedWords.values()].slice(0, limit);
	}

	const totalCount = await prisma.word.count();

	return { query, language, pos: posParam, missing, words, totalCount };
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
		const isPluralOnlyRaw = readText(formData, 'isPluralOnly');
		const alternativePluralForms = readText(formData, 'alternativePluralForms');
		const stayOpen = readText(formData, 'intent') === 'stay';
		const relatedWordIds = [
			...new Set(
				readText(formData, 'relatedWordIds')
					.split(',')
					.map((id) => id.trim())
					.filter(Boolean)
			)
		];

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

		if (relatedWordIds.length > 0) {
			const found = await prisma.word.findMany({
				where: { id: { in: relatedWordIds } },
				select: { id: true }
			});
			if (found.length !== relatedWordIds.length) {
				return fail(400, {
					error: 'One or more related words could not be found.',
					values
				});
			}
		}

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
			word = await prisma.$transaction(async (tx) => {
				const created = await createOrUpdateLinkedWord(tx, {
					kalenjin,
					translations,
					notes: notes || null,
					alternativeSpellings,
					partOfSpeech,
					pluralForm,
					isPluralOnly,
					presentTense,
					imageUrl
				});
				if (relatedWordIds.length > 0) {
					await tx.relatedWord.createMany({
						data: relatedWordIds.map((rid) => relatedWordPair(created.id, rid)),
						skipDuplicates: true
					});
				}
				return created;
			});
		} catch (err) {
			if (imageUrl) {
				await deleteUploadedImage(imageUrl);
			}
			throw err;
		}

		if (stayOpen) {
			return { created: true, word: { id: word.id, kalenjin: word.kalenjin } };
		}

		redirect(303, `/dictionary/${word.id}`);
	}
};
