import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import type { RequestHandler } from './$types';

type Payload = {
	sentenceId?: string;
	field?: 'speaker' | 'english';
	value?: string;
};

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

export const POST: RequestHandler = async ({ params, request }) => {
	const payload = (await request.json()) as Payload;
	const sentenceId = clean(payload.sentenceId);
	const field = payload.field;
	const value = clean(payload.value);

	if (!sentenceId || (field !== 'speaker' && field !== 'english')) {
		return json({ error: 'Sentence and field are required.' }, { status: 400 });
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
		return json({ error: 'Translation is required.' }, { status: 400 });
	}

	const updatedSentence = await prisma.storySentence.update({
		where: { id: sentenceId },
		data: field === 'speaker' ? { speaker: value || null } : { english: value },
		select: {
			id: true,
			speaker: true,
			english: true
		}
	});

	return json({
		sentence: updatedSentence
	});
};
