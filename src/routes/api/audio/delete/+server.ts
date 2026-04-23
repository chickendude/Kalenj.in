import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';
import { prisma } from '$lib/server/prisma';
import { deleteAudio } from '$lib/server/audio-storage';

type TargetType = 'word' | 'sentence';

function isTargetType(value: unknown): value is TargetType {
	return value === 'word' || value === 'sentence';
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

	const existing =
		targetType === 'word'
			? await prisma.word.findUnique({ where: { id: targetId }, select: { audioUrl: true } })
			: await prisma.exampleSentence.findUnique({
					where: { id: targetId },
					select: { audioUrl: true }
				});
	if (!existing) error(404, 'Target not found.');

	if (targetType === 'word') {
		await prisma.word.update({ where: { id: targetId }, data: { audioUrl: null } });
	} else {
		await prisma.exampleSentence.update({ where: { id: targetId }, data: { audioUrl: null } });
	}

	if (existing.audioUrl) {
		await deleteAudio(existing.audioUrl).catch((err) => {
			console.warn('Failed to delete audio file', existing.audioUrl, err);
		});
	}

	return json({ ok: true });
};
