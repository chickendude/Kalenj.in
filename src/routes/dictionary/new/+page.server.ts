import { fail, redirect } from '@sveltejs/kit';
import type { PartOfSpeech } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { prisma } from '$lib/server/prisma';
import { createOrUpdateLinkedWord, readPresentTenseFromFormData } from '$lib/server/lemma-words';
import { requireEditor } from '$lib/server/guards';
import type { Actions, PageServerLoad } from './$types';

function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

export const load: PageServerLoad = async ({ locals }) => {
	requireEditor(locals);
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireEditor(locals);
		const formData = await request.formData();
		const kalenjin = readText(formData, 'kalenjin');
		const translations = readText(formData, 'translations');
		const alternativeSpellings = readText(formData, 'alternativeSpellings');
		const notes = readText(formData, 'notes');
		const partOfSpeechRaw = readText(formData, 'partOfSpeech');
		const pluralFormRaw = readText(formData, 'pluralForm');
		const isPluralOnlyRaw = readText(formData, 'isPluralOnly');

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

		const canHavePlural = partOfSpeech === 'NOUN' || partOfSpeech === 'ADJECTIVE';
		const isPluralOnly = canHavePlural && isPluralOnlyRaw === 'on';
		const pluralForm = canHavePlural && !isPluralOnly && pluralFormRaw ? pluralFormRaw : null;

		const presentTense =
			partOfSpeech === 'VERB' ? readPresentTenseFromFormData(formData) : null;

		const word = await prisma.$transaction((tx) =>
			createOrUpdateLinkedWord(tx, {
				kalenjin,
				translations,
				notes: notes || null,
				alternativeSpellings,
				partOfSpeech,
				pluralForm,
				isPluralOnly,
				presentTense
			})
		);

		redirect(303, `/dictionary/${word.id}`);
	}
};
