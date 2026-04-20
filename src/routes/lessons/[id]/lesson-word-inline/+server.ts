import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import {
	findMatchingExampleSentence,
	formatSentenceInUseError
} from '$lib/server/example-sentence-dedupe';
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

const NON_EMPTY_FIELDS: InlineField[] = [
	'kalenjin',
	'translations',
	'sentenceKalenjin',
	'sentenceEnglish'
];

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

	const typedField = field as InlineField;
	const trimmedValue = value.trim();

	if (NON_EMPTY_FIELDS.includes(typedField) && trimmedValue === '') {
		error(400, 'This field cannot be empty.');
	}

	const lessonWord = await prisma.lessonWord.findUnique({
		where: { id: lessonWordId },
		select: {
			sentenceId: true,
			sentence: { select: { kalenjin: true, english: true } },
			lessonSection: { select: { lessonId: true } }
		}
	});

	if (!lessonWord || lessonWord.lessonSection.lessonId !== params.id) {
		error(404, 'Lesson word not found.');
	}

	if (typedField === 'kalenjin' || typedField === 'translations') {
		await prisma.lessonWord.update({
			where: { id: lessonWordId },
			data: { [typedField]: trimmedValue }
		});
	} else if (typedField === 'sentenceKalenjin' || typedField === 'sentenceEnglish') {
		const nextKalenjin =
			typedField === 'sentenceKalenjin' ? trimmedValue : lessonWord.sentence.kalenjin;
		const nextEnglish =
			typedField === 'sentenceEnglish' ? trimmedValue : lessonWord.sentence.english;

		const match = await findMatchingExampleSentence(
			prisma,
			nextKalenjin,
			nextEnglish,
			lessonWord.sentenceId
		);
		if (match?.lessonWord) {
			error(409, formatSentenceInUseError(match.lessonWord));
		}

		await prisma.$transaction(async (tx) => {
			await tx.exampleSentence.update({
				where: { id: lessonWord.sentenceId },
				data: typedField === 'sentenceKalenjin'
					? { kalenjin: trimmedValue }
					: { english: trimmedValue }
			});
			if (typedField === 'sentenceKalenjin') {
				await syncExampleSentenceTokens(tx, lessonWord.sentenceId, trimmedValue);
			}
		});
	} else if (typedField === 'notesMarkdown') {
		await prisma.lessonWord.update({
			where: { id: lessonWordId },
			data: { notesMarkdown: value.trim() || null }
		});
	}

	return json({ ok: true });
};
