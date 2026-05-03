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
	const user = requireEditor(locals);

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch (err) {
		console.warn('Invalid audio upload request body', err);
		error(400, 'Invalid audio upload request.');
	}

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

	let existing: { audioUrl: string | null } | null;
	try {
		existing =
			targetType === 'word'
				? await prisma.word.findUnique({ where: { id: targetId }, select: { audioUrl: true } })
				: await prisma.exampleSentence.findUnique({
						where: { id: targetId },
						select: { audioUrl: true }
					});
	} catch (err) {
		console.error('Audio target lookup failed', { targetType, targetId, err });
		error(500, 'Could not read audio data. Please try again.');
	}
	if (!existing) error(404, 'Target not found.');

	const inputBuffer = Buffer.from(await file.arrayBuffer());

	let processed: Buffer;
	try {
		processed = await processAudio(inputBuffer);
	} catch (err) {
		console.error('Audio processing failed', err);
		error(400, 'Could not process audio. Try a different recording.');
	}

	let publicUrl: string;
	try {
		({ publicUrl } = await saveAudio(processed));
	} catch (err) {
		console.error('Audio storage write failed. Check AUDIO_UPLOAD_DIR and file permissions.', err);
		error(500, 'Could not save audio. Please try again.');
	}
	const recordedAt = new Date();

	try {
		if (targetType === 'word') {
			await prisma.word.update({
				where: { id: targetId },
				data: {
					audioUrl: publicUrl,
					audioRecordedById: user.id,
					audioRecordedAt: recordedAt
				}
			});
		} else {
			await prisma.exampleSentence.update({
				where: { id: targetId },
				data: {
					audioUrl: publicUrl,
					audioRecordedById: user.id,
					audioRecordedAt: recordedAt
				}
			});
		}
	} catch (err) {
		await deleteAudio(publicUrl).catch((deleteErr) => {
			console.warn('Failed to delete orphaned audio after database update failure', publicUrl, deleteErr);
		});
		console.error('Audio database update failed', { targetType, targetId, err });
		error(500, 'Could not attach audio to the entry. Please try again.');
	}

	if (existing.audioUrl && existing.audioUrl !== publicUrl) {
		await deleteAudio(existing.audioUrl).catch((err) => {
			console.warn('Failed to delete old audio', existing.audioUrl, err);
		});
	}

	return json({ audioUrl: publicUrl });
};
