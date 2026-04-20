import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { syncExampleSentenceTokens } from '$lib/server/sentence-annotations';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';

const ALLOWED_FIELDS = [
	'kalenjin',
	'translations',
	'sentenceKalenjin',
	'sentenceEnglish',
	'notesMarkdown'
] as const;
type InlineField = (typeof ALLOWED_FIELDS)[number];

export const POST: RequestHandler = async ({ request, params, locals }) => {
	requireEditor(locals);
	const body = (await request.json()) as { lessonWordId?: string; field?: string; value?: string };
	const { lessonWordId, field, value } = body;

	if (!lessonWordId || !field || value === undefined) {
		error(400, 'lessonWordId, field, and value are required.');
	}

	if (!(ALLOWED_FIELDS as readonly string[]).includes(field)) {
		error(400, 'Invalid field.');
	}

	const lessonWord = await prisma.lessonWord.findUnique({
		where: { id: lessonWordId },
		select: {
			sentenceId: true,
			sentence: { select: { kalenjin: true } },
			lessonSection: { select: { lessonId: true } }
		}
	});

	if (!lessonWord || lessonWord.lessonSection.lessonId !== params.id) {
		error(404, 'Lesson word not found.');
	}

	const typedField = field as InlineField;

	if (typedField === 'kalenjin' || typedField === 'translations') {
		await prisma.lessonWord.update({
			where: { id: lessonWordId },
			data: { [typedField]: value }
		});
	} else if (typedField === 'sentenceKalenjin') {
		await prisma.$transaction(async (tx) => {
			await tx.exampleSentence.update({
				where: { id: lessonWord.sentenceId },
				data: { kalenjin: value }
			});
			await syncExampleSentenceTokens(tx, lessonWord.sentenceId, value);
		});
	} else if (typedField === 'sentenceEnglish') {
		await prisma.exampleSentence.update({
			where: { id: lessonWord.sentenceId },
			data: { english: value }
		});
	} else if (typedField === 'notesMarkdown') {
		await prisma.lessonWord.update({
			where: { id: lessonWordId },
			data: { notesMarkdown: value || null }
		});
	}

	return json({ ok: true });
};
