import { prisma } from '$lib/server/prisma';

export type TargetType = 'word' | 'word-plural' | 'word-incertain' | 'sentence';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME = new Set([
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

export function isTargetType(value: unknown): value is TargetType {
	return (
		value === 'word' ||
		value === 'word-plural' ||
		value === 'word-incertain' ||
		value === 'sentence'
	);
}

export async function readPreviousAudioUrl(
	targetType: TargetType,
	targetId: string
): Promise<{ found: true; previousUrl: string | null } | { found: false }> {
	if (targetType === 'word') {
		const row = await prisma.word.findUnique({
			where: { id: targetId },
			select: { audioUrl: true }
		});
		return row ? { found: true, previousUrl: row.audioUrl } : { found: false };
	}
	if (targetType === 'word-plural') {
		const row = await prisma.word.findUnique({
			where: { id: targetId },
			select: { pluralAudioUrl: true }
		});
		return row ? { found: true, previousUrl: row.pluralAudioUrl } : { found: false };
	}
	if (targetType === 'word-incertain') {
		const row = await prisma.word.findUnique({
			where: { id: targetId },
			select: { incertainAudioUrl: true }
		});
		return row ? { found: true, previousUrl: row.incertainAudioUrl } : { found: false };
	}
	const row = await prisma.exampleSentence.findUnique({
		where: { id: targetId },
		select: { audioUrl: true }
	});
	return row ? { found: true, previousUrl: row.audioUrl } : { found: false };
}

export async function writeAudioUrl(
	targetType: TargetType,
	targetId: string,
	audioUrl: string,
	userId: string,
	recordedAt: Date
): Promise<void> {
	if (targetType === 'word') {
		await prisma.word.update({
			where: { id: targetId },
			data: { audioUrl, audioRecordedById: userId, audioRecordedAt: recordedAt }
		});
		return;
	}
	if (targetType === 'word-plural') {
		await prisma.word.update({
			where: { id: targetId },
			data: {
				pluralAudioUrl: audioUrl,
				pluralAudioRecordedById: userId,
				pluralAudioRecordedAt: recordedAt
			}
		});
		return;
	}
	if (targetType === 'word-incertain') {
		await prisma.word.update({
			where: { id: targetId },
			data: {
				incertainAudioUrl: audioUrl,
				incertainAudioRecordedById: userId,
				incertainAudioRecordedAt: recordedAt
			}
		});
		return;
	}
	await prisma.exampleSentence.update({
		where: { id: targetId },
		data: { audioUrl, audioRecordedById: userId, audioRecordedAt: recordedAt }
	});
}

export async function clearAudioUrl(targetType: TargetType, targetId: string): Promise<void> {
	if (targetType === 'word') {
		await prisma.word.update({
			where: { id: targetId },
			data: { audioUrl: null, audioRecordedById: null, audioRecordedAt: null }
		});
		return;
	}
	if (targetType === 'word-plural') {
		await prisma.word.update({
			where: { id: targetId },
			data: { pluralAudioUrl: null, pluralAudioRecordedById: null, pluralAudioRecordedAt: null }
		});
		return;
	}
	if (targetType === 'word-incertain') {
		await prisma.word.update({
			where: { id: targetId },
			data: {
				incertainAudioUrl: null,
				incertainAudioRecordedById: null,
				incertainAudioRecordedAt: null
			}
		});
		return;
	}
	await prisma.exampleSentence.update({
		where: { id: targetId },
		data: { audioUrl: null, audioRecordedById: null, audioRecordedAt: null }
	});
}
