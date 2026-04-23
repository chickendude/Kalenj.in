import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { syncExampleSentenceTokens } from '$lib/server/sentence-annotations';
import { requireEditor } from '$lib/server/guards';
import type { RequestHandler } from './$types';

type Payload = {
	field?: 'kalenjin' | 'english';
	value?: string;
};

const WORD_SELECT = {
	id: true,
	kalenjin: true,
	translations: true,
	notes: true,
	partOfSpeech: true,
	pluralForm: true,
	spellings: {
		orderBy: [{ spelling: 'asc' as const }],
		select: {
			id: true,
			spelling: true,
			spellingNormalized: true
		}
	}
};

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	requireEditor(locals);

	const payload = (await request.json()) as Payload;
	const field = payload.field;
	const value = clean(payload.value);

	if (field !== 'kalenjin' && field !== 'english') {
		return json({ error: 'A valid field is required.' }, { status: 400 });
	}

	if (!value) {
		return json(
			{ error: field === 'kalenjin' ? 'Sentence is required.' : 'Translation is required.' },
			{ status: 400 }
		);
	}

	const sentence = await prisma.exampleSentence.findUnique({
		where: { id: params.id },
		select: { id: true }
	});

	if (!sentence) {
		error(404, 'Sentence not found.');
	}

	const updatedSentence = await prisma.$transaction(async (tx) => {
		await tx.exampleSentence.update({
			where: { id: params.id },
			data: field === 'kalenjin' ? { kalenjin: value } : { english: value }
		});

		if (field === 'kalenjin') {
			await syncExampleSentenceTokens(tx, params.id, value);
		}

		return tx.exampleSentence.findUniqueOrThrow({
			where: { id: params.id },
			select: {
				id: true,
				kalenjin: true,
				english: true,
				tokens: {
					orderBy: { tokenOrder: 'asc' },
					include: {
						word: {
							select: WORD_SELECT
						},
						segments: {
							orderBy: { segmentOrder: 'asc' },
							include: {
								word: {
									select: WORD_SELECT
								}
							}
						}
					}
				}
			}
		});
	});

	return json({
		sentence: updatedSentence
	});
};
