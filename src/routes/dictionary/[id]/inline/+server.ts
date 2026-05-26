import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';
import { propagateKalenjinRename } from '$lib/server/propagate-rename';
import { decodeDictionarySegment } from '$lib/word-url';
import { generateUniqueWordSlug } from '$lib/server/word-slugs';

const ALLOWED_FIELDS = ['kalenjin', 'translations'] as const;
type WordInlineField = (typeof ALLOWED_FIELDS)[number];

async function resolveWordId(segment: string): Promise<string | null> {
	const decoded = decodeDictionarySegment(segment);
	if (!decoded) return null;

	const wordBySlug = await prisma.word.findUnique({
		where: { slug: decoded },
		select: { id: true }
	});
	if (wordBySlug) return wordBySlug.id;

	const wordById = await prisma.word.findUnique({
		where: { id: decoded },
		select: { id: true }
	});

	return wordById?.id ?? null;
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
	requireEditor(locals);
	const wordId = await resolveWordId(params.id);
	if (!wordId) {
		error(404, 'Word not found.');
	}
	const body = (await request.json()) as { field?: string; value?: string };
	const { field, value } = body;

	if (!field || value === undefined) {
		error(400, 'field and value are required.');
	}

	if (!(ALLOWED_FIELDS as readonly string[]).includes(field)) {
		error(400, 'Invalid field.');
	}

	const word = await prisma.word.findUnique({ where: { id: wordId } });
	if (!word) {
		error(404, 'Word not found.');
	}

	const typedField = field as WordInlineField;

	const updated = await prisma.$transaction(async (tx) => {
		const next = await tx.word.update({
			where: { id: wordId },
			data: {
				[typedField]: value,
				...(typedField === 'kalenjin'
					? { slug: await generateUniqueWordSlug(tx, value, wordId) }
					: {})
			}
		});
		if (typedField === 'kalenjin' && value !== word.kalenjin) {
			await propagateKalenjinRename(tx, wordId, value, word.slug);
		}
		return next;
	});

	return json({ ok: true, word: { id: updated.id, kalenjin: updated.kalenjin, translations: updated.translations } });
};
