import { fail, redirect } from '@sveltejs/kit';
import type { PartOfSpeech } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
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
		const english = readText(formData, 'english');
		const definition = readText(formData, 'definition');
		const notes = readText(formData, 'notes');
		const partOfSpeechRaw = readText(formData, 'partOfSpeech');

		if (!kalenjin || !english) {
			return fail(400, {
				error: 'Kalenjin and English are required.',
				values: { kalenjin, english, definition, notes, partOfSpeech: partOfSpeechRaw }
			});
		}

		if (partOfSpeechRaw && !isPartOfSpeech(partOfSpeechRaw)) {
			return fail(400, {
				error: 'Invalid part of speech value.',
				values: { kalenjin, english, definition, notes, partOfSpeech: partOfSpeechRaw }
			});
		}

		const partOfSpeech = partOfSpeechRaw ? (partOfSpeechRaw as PartOfSpeech) : null;

		const word = await prisma.word.create({
			data: {
				kalenjin,
				english,
				definition: definition || null,
				notes: notes || null,
				partOfSpeech
			}
		});

		redirect(303, `/dictionary/${word.id}`);
	}
};
