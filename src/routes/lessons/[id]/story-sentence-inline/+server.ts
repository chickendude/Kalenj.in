import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';

type Payload = {
	sentenceId?: string;
	field?: 'speaker' | 'english' | 'grammarNotes';
	value?: string;
};

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	requireEditor(locals);
	const payload = (await request.json()) as Payload;
	const sentenceId = clean(payload.sentenceId);
	const field = payload.field;
	const value = clean(payload.value);

	if (!sentenceId || (field !== 'speaker' && field !== 'english' && field !== 'grammarNotes')) {
		error(400, 'Sentence and field are required.');
	}

	const lesson = await prisma.lesson.findUnique({
		where: { id: params.id },
		select: { storyId: true }
	});

	if (!lesson?.storyId) {
		error(404, 'Story lesson not found.');
	}

	const sentence = await prisma.storySentence.findUnique({
		where: { id: sentenceId },
		select: { id: true, storyId: true, exampleSentenceId: true }
	});

	if (!sentence || sentence.storyId !== lesson.storyId) {
		error(404, 'Story sentence not found.');
	}

	if (field === 'english' && !value) {
		error(400, 'Translation is required.');
	}

	const updatedSentence = await prisma.$transaction(async (tx) => {
		if (field === 'english') {
			await tx.exampleSentence.update({
				where: { id: sentence.exampleSentenceId },
				data: { english: value }
			});
		} else {
			await tx.storySentence.update({
				where: { id: sentenceId },
				data: field === 'speaker' ? { speaker: value || null } : { grammarNotes: value || null }
			});
		}

		return tx.storySentence.findUniqueOrThrow({
			where: { id: sentenceId },
			select: {
				id: true,
				speaker: true,
				grammarNotes: true,
				exampleSentence: { select: { english: true } }
			}
		});
	});

	return json({
		sentence: {
			id: updatedSentence.id,
			speaker: updatedSentence.speaker,
			english: updatedSentence.exampleSentence.english,
			grammarNotes: updatedSentence.grammarNotes
		}
	});
};
