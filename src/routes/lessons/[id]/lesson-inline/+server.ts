import { error, json } from '@sveltejs/kit';
import { isVocabularyLessonType } from '$lib/course';
import { prisma } from '$lib/server/prisma';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';

type Field = 'title' | 'vocabularyType' | 'grammarMarkdown';

type Payload = {
	field?: Field;
	value?: string;
};

const ALLOWED_FIELDS: readonly Field[] = ['title', 'vocabularyType', 'grammarMarkdown'];

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	requireEditor(locals);
	const payload = (await request.json()) as Payload;
	const field = payload.field;
	const value = clean(payload.value);

	if (!field || !(ALLOWED_FIELDS as readonly string[]).includes(field)) {
		error(400, 'Field is required.');
	}

	const lesson = await prisma.lesson.findUnique({
		where: { id: params.id },
		select: { id: true, type: true, storyId: true }
	});

	if (!lesson) {
		error(404, 'Lesson not found.');
	}

	if (field === 'title') {
		if (!value) {
			error(400, 'Title is required.');
		}

		// Slugs are position-based (lesson-N/story-N), so renames don't touch them.
		await prisma.$transaction(async (tx) => {
			await tx.lesson.update({
				where: { id: lesson.id },
				data: { title: value }
			});

			if (lesson.storyId) {
				await tx.story.update({
					where: { id: lesson.storyId },
					data: { title: value }
				});
			}
		});

		return json({ title: value });
	}

	if (field === 'vocabularyType') {
		if (lesson.type !== 'VOCABULARY') {
			error(400, 'Only vocabulary lessons have a vocabulary type.');
		}

		if (!isVocabularyLessonType(value)) {
			error(400, 'Invalid vocabulary type.');
		}

		await prisma.lesson.update({
			where: { id: lesson.id },
			data: { vocabularyType: value }
		});

		return json({ vocabularyType: value });
	}

	if (lesson.type !== 'VOCABULARY') {
		error(400, 'Only vocabulary lessons have grammar notes.');
	}

	const nextValue = value || null;
	await prisma.lesson.update({
		where: { id: lesson.id },
		data: { grammarMarkdown: nextValue }
	});

	return json({ grammarMarkdown: nextValue });
};
