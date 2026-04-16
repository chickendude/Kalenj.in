import { fail, redirect } from '@sveltejs/kit';
import type { PartOfSpeech } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { prisma } from '$lib/server/prisma';
import { normalizeLemma } from '$lib/server/normalize-lemma';
import { prepareAlternativeSpellings } from '$lib/server/kalenjin-word-search';
import type { Actions, PageServerLoad } from './$types';

function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

export const load: PageServerLoad = async () => {
	return {};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const kalenjin = readText(formData, 'kalenjin');
		const translations = readText(formData, 'translations');
		const alternativeSpellings = readText(formData, 'alternativeSpellings');
		const notes = readText(formData, 'notes');
		const partOfSpeechRaw = readText(formData, 'partOfSpeech');

		if (!kalenjin || !translations) {
			return fail(400, {
				error: 'Kalenjin and translations are required.',
				values: { kalenjin, translations, alternativeSpellings, notes, partOfSpeech: partOfSpeechRaw }
			});
		}

		if (partOfSpeechRaw && !isPartOfSpeech(partOfSpeechRaw)) {
			return fail(400, {
				error: 'Invalid part of speech value.',
				values: { kalenjin, translations, alternativeSpellings, notes, partOfSpeech: partOfSpeechRaw }
			});
		}

		const partOfSpeech = partOfSpeechRaw ? (partOfSpeechRaw as PartOfSpeech) : null;
		const spellings = prepareAlternativeSpellings(alternativeSpellings, kalenjin);

		const word = await prisma.word.create({
			data: {
				kalenjin,
				kalenjinNormalized: normalizeLemma(kalenjin),
				translations,
				notes: notes || null,
				partOfSpeech,
				spellings: spellings.length
					? {
							createMany: {
								data: spellings
							}
						}
					: undefined
			}
		});

		redirect(303, `/dictionary/${word.id}`);
	}
};
