import { error, json } from '@sveltejs/kit';
import { isVocabularyLessonType } from '$lib/course';
import { prisma } from '$lib/server/prisma';
import type { RequestHandler } from './$types';

type Field = 'title' | 'vocabularyType' | 'grammarMarkdown';

type Payload = {
	field?: Field;
	value?: string;
};

const ALLOWED_FIELDS: readonly Field[] = ['title', 'vocabularyType', 'grammarMarkdown'];

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

export const POST: RequestHandler = async ({ params, request }) => {
	const payload = (await request.json()) as Payload;
	const field = payload.field;
	const value = clean(payload.value);

	if (!field || !(ALLOWED_FIELDS as readonly string[]).includes(field)) {
		return json({ error: 'Field is required.' }, { status: 400 });
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
			return json({ error: 'Title is required.' }, { status: 400 });
		}

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
			return json(
				{ error: 'Only vocabulary lessons have a vocabulary type.' },
				{ status: 400 }
			);
		}

		if (!isVocabularyLessonType(value)) {
			return json({ error: 'Invalid vocabulary type.' }, { status: 400 });
		}

		await prisma.lesson.update({
			where: { id: lesson.id },
			data: { vocabularyType: value }
		});

		return json({ vocabularyType: value });
	}

	if (lesson.type !== 'VOCABULARY') {
		return json(
			{ error: 'Only vocabulary lessons have grammar notes.' },
			{ status: 400 }
		);
	}

	const nextValue = value || null;
	await prisma.lesson.update({
		where: { id: lesson.id },
		data: { grammarMarkdown: nextValue }
	});

	return json({ grammarMarkdown: nextValue });
};
