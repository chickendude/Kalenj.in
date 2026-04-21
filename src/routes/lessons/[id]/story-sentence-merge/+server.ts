import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { mergeStorySentenceWithNext } from '$lib/server/story-sync';
import { requireEditor } from '$lib/server/guards';
import type { RequestHandler } from './$types';

type Payload = {
	sentenceId?: string;
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	requireEditor(locals);
	const payload = (await request.json()) as Payload;
	const sentenceId = String(payload.sentenceId ?? '').trim();

	if (!sentenceId) {
		return json({ error: 'Sentence is required.' }, { status: 400 });
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
		select: { storyId: true }
	});

	if (!sentence || sentence.storyId !== lesson.storyId) {
		error(404, 'Story sentence not found.');
	}

	const result = await prisma.$transaction((tx) =>
		mergeStorySentenceWithNext(tx, sentenceId)
	);

	if (!result.merged) {
		return json({ error: 'No next sentence to merge with.' }, { status: 400 });
	}

	return json(result);
};
