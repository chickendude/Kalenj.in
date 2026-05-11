import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';
import { prisma } from '$lib/server/prisma';
import { deleteAudio } from '$lib/server/audio-storage';

type TargetType = 'word' | 'word-plural' | 'sentence';

function isTargetType(value: unknown): value is TargetType {
	return value === 'word' || value === 'word-plural' || value === 'sentence';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);

	const body = (await request.json().catch(() => null)) as {
		targetType?: unknown;
		targetId?: unknown;
	} | null;

	if (!body) error(400, 'Invalid request body.');
	if (typeof body.targetId !== 'string' || !body.targetId) error(400, 'Missing targetId.');
	if (!isTargetType(body.targetType)) error(400, 'Invalid targetType.');

	const { targetType, targetId } = body;

	let existing: { audioUrl: string | null } | null;
	if (targetType === 'word') {
		existing = await prisma.word.findUnique({
			where: { id: targetId },
			select: { audioUrl: true }
		});
	} else if (targetType === 'word-plural') {
		const row = await prisma.word.findUnique({
			where: { id: targetId },
			select: { pluralAudioUrl: true }
		});
		existing = row ? { audioUrl: row.pluralAudioUrl } : null;
	} else {
		existing = await prisma.exampleSentence.findUnique({
			where: { id: targetId },
			select: { audioUrl: true }
		});
	}
	if (!existing) error(404, 'Target not found.');

	if (targetType === 'word') {
		await prisma.word.update({
			where: { id: targetId },
			data: { audioUrl: null, audioRecordedById: null, audioRecordedAt: null }
		});
	} else if (targetType === 'word-plural') {
		await prisma.word.update({
			where: { id: targetId },
			data: { pluralAudioUrl: null, pluralAudioRecordedById: null, pluralAudioRecordedAt: null }
		});
	} else {
		await prisma.exampleSentence.update({
			where: { id: targetId },
			data: { audioUrl: null, audioRecordedById: null, audioRecordedAt: null }
		});
	}

	if (existing.audioUrl) {
		await deleteAudio(existing.audioUrl).catch((err) => {
			console.warn('Failed to delete audio file', existing.audioUrl, err);
		});
	}

	return json({ ok: true });
};
