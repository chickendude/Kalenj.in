import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';
import { prisma } from '$lib/server/prisma';
import { saveAudio } from '$lib/server/audio-storage';
import { processAudioSegments } from '$lib/server/audio-processing';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_SEGMENTS = 100;

type TargetType = 'word' | 'word-plural' | 'sentence';

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
	'word-plural': {
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
	targetType: TargetType;
	startMs: number;
	endMs: number;
};

function isTargetType(value: unknown): value is TargetType {
	return value === 'word' || value === 'word-plural' || value === 'sentence';
}

function parseSegments(raw: unknown, defaultType: TargetType): SegmentInput[] {
	if (!Array.isArray(raw)) error(400, 'Segments must be an array.');
	if (raw.length === 0) error(400, 'No segments provided.');
	if (raw.length > MAX_SEGMENTS) error(400, `Too many segments (max ${MAX_SEGMENTS}).`);

	const seenKeys = new Set<string>();
	const segments: SegmentInput[] = [];
	for (let i = 0; i < raw.length; i += 1) {
		const item: unknown = raw[i];
		if (!item || typeof item !== 'object') error(400, `Segment ${i} is not an object.`);
		const targetId: unknown = (item as { targetId?: unknown }).targetId;
		const startMs: unknown = (item as { startMs?: unknown }).startMs;
		const endMs: unknown = (item as { endMs?: unknown }).endMs;
		const targetTypeRaw: unknown = (item as { targetType?: unknown }).targetType ?? defaultType;
		if (typeof targetId !== 'string' || !targetId) error(400, `Segment ${i} is missing targetId.`);
		if (!isTargetType(targetTypeRaw)) error(400, `Segment ${i} has invalid targetType.`);
		if (typeof startMs !== 'number' || !Number.isFinite(startMs) || startMs < 0) {
			error(400, `Segment ${i} has invalid startMs.`);
		}
		if (typeof endMs !== 'number' || !Number.isFinite(endMs) || endMs <= startMs) {
			error(400, `Segment ${i} has invalid endMs.`);
		}
		const limits = TARGET_LIMITS[targetTypeRaw];
		const durationSec = (endMs - startMs) / 1000;
		if (durationSec < limits.minSegmentSec) {
			error(400, `Segment ${i} is too short (< ${limits.minSegmentSec}s).`);
		}
		if (durationSec > limits.maxSegmentSec) {
			error(400, `Segment ${i} is too long (> ${limits.maxSegmentSec}s).`);
		}
		const key = `${targetTypeRaw}:${targetId}`;
		if (seenKeys.has(key)) error(400, `Target ${targetId} (${targetTypeRaw}) appears more than once.`);
		seenKeys.add(key);
		segments.push({ targetId, targetType: targetTypeRaw, startMs, endMs });
	}
	return segments;
}

async function verifyTargetsExist(segments: SegmentInput[]) {
	const wordIds = new Set<string>();
	const sentenceIds = new Set<string>();
	for (const segment of segments) {
		if (segment.targetType === 'sentence') {
			sentenceIds.add(segment.targetId);
		} else {
			wordIds.add(segment.targetId);
		}
	}

	const [wordCount, sentenceCount] = await Promise.all([
		wordIds.size > 0
			? prisma.word.count({ where: { id: { in: Array.from(wordIds) } } })
			: Promise.resolve(0),
		sentenceIds.size > 0
			? prisma.exampleSentence.count({ where: { id: { in: Array.from(sentenceIds) } } })
			: Promise.resolve(0)
	]);

	if (wordCount !== wordIds.size) error(404, 'One or more words were not found.');
	if (sentenceCount !== sentenceIds.size) error(404, 'One or more sentences were not found.');
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
	const defaultType: TargetType = targetTypeRaw;

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
	const segments = parseSegments(parsed, defaultType);

	await verifyTargetsExist(segments);

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

	const results: {
		targetId: string;
		targetType: TargetType;
		audioUrl: string;
		durationSec: number | null;
	}[] = [];
	const skipped: { targetId: string; targetType: TargetType; reason: string }[] = [];

	// Save processed clips to disk so they're playable for review, but DO NOT
	// link them to the target row yet. The client decides which to commit.
	for (let i = 0; i < segments.length; i += 1) {
		const segment = segments[i];
		const piece = processed[i];
		const limits = TARGET_LIMITS[segment.targetType];
		const duration = piece.durationSec ?? 0;
		if (duration && (duration < limits.minProcessedSec || duration > limits.maxProcessedSec)) {
			skipped.push({
				targetId: segment.targetId,
				targetType: segment.targetType,
				reason: `Trimmed length ${duration.toFixed(2)}s is outside ${limits.minProcessedSec}–${limits.maxProcessedSec}s.`
			});
			continue;
		}
		if (piece.buffer.length === 0) {
			skipped.push({
				targetId: segment.targetId,
				targetType: segment.targetType,
				reason: 'Empty after processing.'
			});
			continue;
		}

		const { publicUrl } = await saveAudio(piece.buffer);
		results.push({
			targetId: segment.targetId,
			targetType: segment.targetType,
			audioUrl: publicUrl,
			durationSec: piece.durationSec
		});
	}

	return json({ results, skipped });
};
