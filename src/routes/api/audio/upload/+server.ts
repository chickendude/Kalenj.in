import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';
import { prisma } from '$lib/server/prisma';
import { deleteAudio, saveAudio } from '$lib/server/audio-storage';
import { processAudio } from '$lib/server/audio-processing';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME = new Set([
	'audio/webm',
	'audio/ogg',
	'audio/mpeg',
	'audio/mp3',
	'audio/mp4',
	'audio/x-m4a',
	'audio/m4a',
	'audio/wav',
	'audio/wave',
	'audio/x-wav'
]);

type TargetType = 'word' | 'sentence';

function isTargetType(value: unknown): value is TargetType {
	return value === 'word' || value === 'sentence';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);

	const formData = await request.formData();
	const file = formData.get('file');
	const targetType = formData.get('targetType');
	const targetId = formData.get('targetId');

	if (!(file instanceof File)) error(400, 'Missing audio file.');
	if (typeof targetId !== 'string' || !targetId) error(400, 'Missing targetId.');
	if (!isTargetType(targetType)) error(400, 'Invalid targetType.');

	if (file.size === 0) error(400, 'Audio file is empty.');
	if (file.size > MAX_UPLOAD_BYTES) error(413, 'Audio file is too large.');

	const mime = (file.type || '').split(';')[0].trim().toLowerCase();
	if (mime && !ALLOWED_MIME.has(mime)) {
		error(415, `Unsupported audio type: ${file.type}`);
	}

	const existing =
		targetType === 'word'
			? await prisma.word.findUnique({ where: { id: targetId }, select: { audioUrl: true } })
			: await prisma.exampleSentence.findUnique({
					where: { id: targetId },
					select: { audioUrl: true }
				});
	if (!existing) error(404, 'Target not found.');

	const inputBuffer = Buffer.from(await file.arrayBuffer());

	let processed: Buffer;
	try {
		processed = await processAudio(inputBuffer);
	} catch (err) {
		console.error('Audio processing failed', err);
		error(400, 'Could not process audio. Try a different recording.');
	}

	const { publicUrl } = await saveAudio(processed);

	if (targetType === 'word') {
		await prisma.word.update({ where: { id: targetId }, data: { audioUrl: publicUrl } });
	} else {
		await prisma.exampleSentence.update({
			where: { id: targetId },
			data: { audioUrl: publicUrl }
		});
	}

	if (existing.audioUrl && existing.audioUrl !== publicUrl) {
		await deleteAudio(existing.audioUrl).catch((err) => {
			console.warn('Failed to delete old audio', existing.audioUrl, err);
		});
	}

	return json({ audioUrl: publicUrl });
};
