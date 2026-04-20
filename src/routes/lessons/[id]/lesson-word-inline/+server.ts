import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import {
	findMatchingExampleSentence,
	formatSentenceInUseError
} from '$lib/server/example-sentence-dedupe';
import { syncExampleSentenceTokens } from '$lib/server/sentence-annotations';
import { UNSET_SENTENCE_ENGLISH } from '$lib/sentence-placeholders';
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
			translations: true,
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
		const currentSentenceId = lessonWord.sentenceId;
		const currentSentence = lessonWord.sentence;

		if (!currentSentenceId || !currentSentence) {
			if (typedField === 'sentenceEnglish') {
				error(400, 'Add sentence text before adding a translation.');
			}

			const nextKalenjin = trimmedValue;
			const nextEnglish = UNSET_SENTENCE_ENGLISH;
			const match = await findMatchingExampleSentence(prisma, nextKalenjin, nextEnglish);
			if (match?.lessonWord) {
				error(409, formatSentenceInUseError(match.lessonWord));
			}

			await prisma.$transaction(async (tx) => {
				let sentenceId = match?.id;
				if (!sentenceId) {
					const sentence = await tx.exampleSentence.create({
						data: { kalenjin: nextKalenjin, english: nextEnglish }
					});
					await syncExampleSentenceTokens(tx, sentence.id, nextKalenjin);
					sentenceId = sentence.id;
				}

				await tx.lessonWord.update({
					where: { id: lessonWordId },
					data: { sentenceId }
				});
			});

			return json({ ok: true });
		}

		const nextKalenjin =
			typedField === 'sentenceKalenjin' ? trimmedValue : currentSentence.kalenjin;
		const nextEnglish =
			typedField === 'sentenceEnglish' ? trimmedValue : currentSentence.english;

		const match = await findMatchingExampleSentence(
			prisma,
			nextKalenjin,
			nextEnglish,
			currentSentenceId
		);
		if (match?.lessonWord) {
			error(409, formatSentenceInUseError(match.lessonWord));
		}

		await prisma.$transaction(async (tx) => {
			await tx.exampleSentence.update({
				where: { id: currentSentenceId },
				data: typedField === 'sentenceKalenjin'
					? { kalenjin: trimmedValue }
					: { english: trimmedValue }
			});
			if (typedField === 'sentenceKalenjin') {
				await syncExampleSentenceTokens(tx, currentSentenceId, trimmedValue);
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
