import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';
import { prisma } from '$lib/server/prisma';
import { saveAudio } from '$lib/server/audio-storage';
import { processAudioSegments } from '$lib/server/audio-processing';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_SEGMENTS = 100;

type TargetType = 'word' | 'sentence';

const TARGET_LIMITS: Record<
	TargetType,
	{
		minSegmentSec: number;
		maxSegmentSec: number;
		minProcessedSec: number;
		maxProcessedSec: number;
	}
> = {
	word: {
		minSegmentSec: 0.2,
		maxSegmentSec: 8,
		minProcessedSec: 0.15,
		maxProcessedSec: 6
	},
	sentence: {
		minSegmentSec: 0.4,
		maxSegmentSec: 25,
		minProcessedSec: 0.3,
		maxProcessedSec: 22
	}
};

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

type SegmentInput = {
	targetId: string;
	startMs: number;
	endMs: number;
};

function isTargetType(value: unknown): value is TargetType {
	return value === 'word' || value === 'sentence';
}

function parseSegments(raw: unknown, limits: (typeof TARGET_LIMITS)[TargetType]): SegmentInput[] {
	if (!Array.isArray(raw)) error(400, 'Segments must be an array.');
	if (raw.length === 0) error(400, 'No segments provided.');
	if (raw.length > MAX_SEGMENTS) error(400, `Too many segments (max ${MAX_SEGMENTS}).`);

	const seenIds = new Set<string>();
	const segments: SegmentInput[] = [];
	for (let i = 0; i < raw.length; i += 1) {
		const item: unknown = raw[i];
		if (!item || typeof item !== 'object') error(400, `Segment ${i} is not an object.`);
		const targetId: unknown = (item as { targetId?: unknown }).targetId;
		const startMs: unknown = (item as { startMs?: unknown }).startMs;
		const endMs: unknown = (item as { endMs?: unknown }).endMs;
		if (typeof targetId !== 'string' || !targetId) error(400, `Segment ${i} is missing targetId.`);
		if (typeof startMs !== 'number' || !Number.isFinite(startMs) || startMs < 0) {
			error(400, `Segment ${i} has invalid startMs.`);
		}
		if (typeof endMs !== 'number' || !Number.isFinite(endMs) || endMs <= startMs) {
			error(400, `Segment ${i} has invalid endMs.`);
		}
		const durationSec = (endMs - startMs) / 1000;
		if (durationSec < limits.minSegmentSec) {
			error(400, `Segment ${i} is too short (< ${limits.minSegmentSec}s).`);
		}
		if (durationSec > limits.maxSegmentSec) {
			error(400, `Segment ${i} is too long (> ${limits.maxSegmentSec}s).`);
		}
		if (seenIds.has(targetId)) error(400, `Target ${targetId} appears more than once.`);
		seenIds.add(targetId);
		segments.push({ targetId, startMs, endMs });
	}
	return segments;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);

	const formData = await request.formData();
	const file = formData.get('file');
	const segmentsRaw = formData.get('segments');
	const targetTypeRaw = formData.get('targetType') ?? 'word';

	if (!(file instanceof File)) error(400, 'Missing audio file.');
	if (typeof segmentsRaw !== 'string' || !segmentsRaw) error(400, 'Missing segments JSON.');
	if (file.size === 0) error(400, 'Audio file is empty.');
	if (file.size > MAX_UPLOAD_BYTES) error(413, 'Audio file is too large.');
	if (!isTargetType(targetTypeRaw)) error(400, 'Invalid targetType.');
	const targetType: TargetType = targetTypeRaw;
	const limits = TARGET_LIMITS[targetType];

	const mime = (file.type || '').split(';')[0].trim().toLowerCase();
	if (mime && !ALLOWED_MIME.has(mime)) {
		error(415, `Unsupported audio type: ${file.type}`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(segmentsRaw);
	} catch {
		error(400, 'Segments JSON is invalid.');
	}
	const segments = parseSegments(parsed, limits);

	const targetIds = segments.map((s) => s.targetId);
	const uniqueIds = new Set(targetIds);
	const existingCount =
		targetType === 'word'
			? await prisma.word.count({ where: { id: { in: targetIds } } })
			: await prisma.exampleSentence.count({ where: { id: { in: targetIds } } });
	if (existingCount !== uniqueIds.size) {
		error(404, `One or more ${targetType === 'word' ? 'words' : 'sentences'} were not found.`);
	}

	const inputBuffer = Buffer.from(await file.arrayBuffer());

	let processed: { buffer: Buffer; durationSec: number | null }[];
	try {
		processed = await processAudioSegments(
			inputBuffer,
			segments.map((s) => ({ startSec: s.startMs / 1000, endSec: s.endMs / 1000 }))
		);
	} catch (err) {
		console.error('Bulk audio processing failed', err);
		error(400, 'Could not process audio. Try a different recording.');
	}

	if (processed.length !== segments.length) {
		error(500, 'Segment count mismatch after processing.');
	}

	const results: { targetId: string; audioUrl: string; durationSec: number | null }[] = [];
	const skipped: { targetId: string; reason: string }[] = [];

	// Save processed clips to disk so they're playable for review, but DO NOT
	// link them to the target row yet. The client decides which to commit.
	for (let i = 0; i < segments.length; i += 1) {
		const segment = segments[i];
		const piece = processed[i];
		const duration = piece.durationSec ?? 0;
		if (duration && (duration < limits.minProcessedSec || duration > limits.maxProcessedSec)) {
			skipped.push({
				targetId: segment.targetId,
				reason: `Trimmed length ${duration.toFixed(2)}s is outside ${limits.minProcessedSec}–${limits.maxProcessedSec}s.`
			});
			continue;
		}
		if (piece.buffer.length === 0) {
			skipped.push({ targetId: segment.targetId, reason: 'Empty after processing.' });
			continue;
		}

		const { publicUrl } = await saveAudio(piece.buffer);
		results.push({
			targetId: segment.targetId,
			audioUrl: publicUrl,
			durationSec: piece.durationSec
		});
	}

	return json({ results, skipped });
};
