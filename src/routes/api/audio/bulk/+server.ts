import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';
import { prisma } from '$lib/server/prisma';
import { saveAudio } from '$lib/server/audio-storage';
import { processAudioSegments } from '$lib/server/audio-processing';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_SEGMENTS = 100;
const MIN_SEGMENT_SEC = 0.2;
const MAX_SEGMENT_SEC = 8;
const MIN_PROCESSED_SEC = 0.15;
const MAX_PROCESSED_SEC = 6;

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
	wordId: string;
	startMs: number;
	endMs: number;
};

function parseSegments(raw: unknown): SegmentInput[] {
	if (!Array.isArray(raw)) error(400, 'Segments must be an array.');
	if (raw.length === 0) error(400, 'No segments provided.');
	if (raw.length > MAX_SEGMENTS) error(400, `Too many segments (max ${MAX_SEGMENTS}).`);

	const seenIds = new Set<string>();
	const segments: SegmentInput[] = [];
	for (let i = 0; i < raw.length; i += 1) {
		const item: unknown = raw[i];
		if (!item || typeof item !== 'object') error(400, `Segment ${i} is not an object.`);
		const wordId: unknown = (item as { wordId?: unknown }).wordId;
		const startMs: unknown = (item as { startMs?: unknown }).startMs;
		const endMs: unknown = (item as { endMs?: unknown }).endMs;
		if (typeof wordId !== 'string' || !wordId) error(400, `Segment ${i} is missing wordId.`);
		if (typeof startMs !== 'number' || !Number.isFinite(startMs) || startMs < 0) {
			error(400, `Segment ${i} has invalid startMs.`);
		}
		if (typeof endMs !== 'number' || !Number.isFinite(endMs) || endMs <= startMs) {
			error(400, `Segment ${i} has invalid endMs.`);
		}
		const durationSec = (endMs - startMs) / 1000;
		if (durationSec < MIN_SEGMENT_SEC) {
			error(400, `Segment ${i} is too short (< ${MIN_SEGMENT_SEC}s).`);
		}
		if (durationSec > MAX_SEGMENT_SEC) {
			error(400, `Segment ${i} is too long (> ${MAX_SEGMENT_SEC}s).`);
		}
		if (seenIds.has(wordId)) error(400, `Word ${wordId} appears more than once.`);
		seenIds.add(wordId);
		segments.push({ wordId, startMs, endMs });
	}
	return segments;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);

	const formData = await request.formData();
	const file = formData.get('file');
	const segmentsRaw = formData.get('segments');

	if (!(file instanceof File)) error(400, 'Missing audio file.');
	if (typeof segmentsRaw !== 'string' || !segmentsRaw) error(400, 'Missing segments JSON.');
	if (file.size === 0) error(400, 'Audio file is empty.');
	if (file.size > MAX_UPLOAD_BYTES) error(413, 'Audio file is too large.');

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
	const segments = parseSegments(parsed);

	const wordIds = segments.map((s) => s.wordId);
	const wordCount = await prisma.word.count({ where: { id: { in: wordIds } } });
	if (wordCount !== new Set(wordIds).size) error(404, 'One or more words were not found.');

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

	const results: { wordId: string; audioUrl: string; durationSec: number | null }[] = [];
	const skipped: { wordId: string; reason: string }[] = [];

	// Save processed clips to disk so they're playable for review, but DO NOT
	// link them to words yet. The client decides which to commit.
	for (let i = 0; i < segments.length; i += 1) {
		const segment = segments[i];
		const piece = processed[i];
		const duration = piece.durationSec ?? 0;
		if (duration && (duration < MIN_PROCESSED_SEC || duration > MAX_PROCESSED_SEC)) {
			skipped.push({
				wordId: segment.wordId,
				reason: `Trimmed length ${duration.toFixed(2)}s is outside ${MIN_PROCESSED_SEC}–${MAX_PROCESSED_SEC}s.`
			});
			continue;
		}
		if (piece.buffer.length === 0) {
			skipped.push({ wordId: segment.wordId, reason: 'Empty after processing.' });
			continue;
		}

		const { publicUrl } = await saveAudio(piece.buffer);
		results.push({
			wordId: segment.wordId,
			audioUrl: publicUrl,
			durationSec: piece.durationSec
		});
	}

	return json({ results, skipped });
};
