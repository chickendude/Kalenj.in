import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { syncStorySentenceToCorpus } from '$lib/server/story-sync';
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
		select: { id: true, storyId: true }
	});

	if (!sentence || sentence.storyId !== lesson.storyId) {
		error(404, 'Story sentence not found.');
	}

	if (field === 'english' && !value) {
		error(400, 'Translation is required.');
	}

	const updatedSentence = await prisma.$transaction(async (tx) => {
		const updated = await tx.storySentence.update({
			where: { id: sentenceId },
			data:
				field === 'speaker'
					? { speaker: value || null }
					: field === 'grammarNotes'
						? { grammarNotes: value || null }
						: { english: value },
			select: {
				id: true,
				speaker: true,
				english: true,
				grammarNotes: true
			}
		});

		if (field === 'english') {
			await syncStorySentenceToCorpus(tx, sentenceId);
		}

		return updated;
	});

	return json({
		sentence: updatedSentence
	});
};
