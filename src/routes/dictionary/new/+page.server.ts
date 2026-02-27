import { fail, redirect } from '@sveltejs/kit';
import type { PartOfSpeech } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { normalizeLemma } from '$lib/server/normalize-lemma';
import { prisma } from '$lib/server/prisma';
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
		const notes = readText(formData, 'notes');
		const partOfSpeechRaw = readText(formData, 'partOfSpeech');

		if (!kalenjin || !translations) {
			return fail(400, {
				error: 'Kalenjin and translations are required.',
				values: { kalenjin, translations, notes, partOfSpeech: partOfSpeechRaw }
			});
		}

		if (partOfSpeechRaw && !isPartOfSpeech(partOfSpeechRaw)) {
			return fail(400, {
				error: 'Invalid part of speech value.',
				values: { kalenjin, translations, notes, partOfSpeech: partOfSpeechRaw }
			});
		}

		const partOfSpeech = partOfSpeechRaw ? (partOfSpeechRaw as PartOfSpeech) : null;
		const kalenjinNormalized = normalizeLemma(kalenjin);

		const word = await prisma.word.create({
			data: {
				kalenjin,
				kalenjinNormalized,
				translations,
				notes: notes || null,
				partOfSpeech
			}
		});

		redirect(303, `/dictionary/${word.id}`);
	}
};
