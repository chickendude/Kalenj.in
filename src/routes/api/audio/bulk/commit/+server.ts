import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';
import { deleteAudio } from '$lib/server/audio-storage';
import {
	isTargetType,
	readPreviousAudioUrl,
	writeAudioUrl,
	type TargetType
} from '$lib/server/audio-targets';

const MAX_ENTRIES = 100;

type KeepEntry = { targetId: string; targetType: TargetType; audioUrl: string };

function parseKeep(raw: unknown, defaultType: TargetType): KeepEntry[] {
	if (raw === undefined || raw === null) return [];
	if (!Array.isArray(raw)) error(400, 'keep must be an array.');
	if (raw.length > MAX_ENTRIES) error(400, `Too many keep entries (max ${MAX_ENTRIES}).`);

	const seen = new Set<string>();
	const entries: KeepEntry[] = [];
	for (let i = 0; i < raw.length; i += 1) {
		const item: unknown = raw[i];
		if (!item || typeof item !== 'object') error(400, `keep[${i}] is not an object.`);
		const targetId: unknown = (item as { targetId?: unknown }).targetId;
		const audioUrl: unknown = (item as { audioUrl?: unknown }).audioUrl;
		const targetTypeRaw: unknown = (item as { targetType?: unknown }).targetType ?? defaultType;
		if (typeof targetId !== 'string' || !targetId) error(400, `keep[${i}] missing targetId.`);
		if (typeof audioUrl !== 'string' || !audioUrl) error(400, `keep[${i}] missing audioUrl.`);
		if (!isTargetType(targetTypeRaw)) error(400, `keep[${i}] has invalid targetType.`);
		const key = `${targetTypeRaw}:${targetId}`;
		if (seen.has(key)) error(400, `Target ${targetId} (${targetTypeRaw}) appears more than once in keep.`);
		seen.add(key);
		entries.push({ targetId, audioUrl, targetType: targetTypeRaw });
	}
	return entries;
}

function parseDiscard(raw: unknown): string[] {
	if (raw === undefined || raw === null) return [];
	if (!Array.isArray(raw)) error(400, 'discard must be an array.');
	if (raw.length > MAX_ENTRIES) error(400, `Too many discard entries (max ${MAX_ENTRIES}).`);
	const urls: string[] = [];
	for (let i = 0; i < raw.length; i += 1) {
		const item: unknown = raw[i];
		if (typeof item !== 'string' || !item) error(400, `discard[${i}] is not a string.`);
		urls.push(item);
	}
	return urls;
}

function notFoundReason(targetType: TargetType): string {
	if (targetType === 'sentence') return 'Sentence not found.';
	return 'Word not found.';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireEditor(locals);

	const payload = await request.json().catch(() => null);
	if (!payload || typeof payload !== 'object') error(400, 'Invalid request body.');
	const targetTypeRaw = (payload as { targetType?: unknown }).targetType ?? 'word';
	if (!isTargetType(targetTypeRaw)) error(400, 'Invalid targetType.');
	const defaultType: TargetType = targetTypeRaw;

	const keep = parseKeep((payload as { keep?: unknown }).keep, defaultType);
	const discard = parseDiscard((payload as { discard?: unknown }).discard);

	if (keep.length === 0 && discard.length === 0) {
		error(400, 'No keep or discard entries provided.');
	}

	const committed: { targetId: string; targetType: TargetType; audioUrl: string }[] = [];
	const failed: { targetId: string; targetType: TargetType; reason: string }[] = [];

	const now = new Date();
	for (const entry of keep) {
		const existing = await readPreviousAudioUrl(entry.targetType, entry.targetId);
		if (!existing.found) {
			failed.push({
				targetId: entry.targetId,
				targetType: entry.targetType,
				reason: notFoundReason(entry.targetType)
			});
			continue;
		}
		await writeAudioUrl(entry.targetType, entry.targetId, entry.audioUrl, user.id, now);
		if (existing.previousUrl && existing.previousUrl !== entry.audioUrl) {
			const prev = existing.previousUrl;
			await deleteAudio(prev).catch((err) => {
				console.warn('Failed to delete previous audio', prev, err);
			});
		}
		committed.push({
			targetId: entry.targetId,
			targetType: entry.targetType,
			audioUrl: entry.audioUrl
		});
	}

	for (const url of discard) {
		await deleteAudio(url).catch((err) => {
			console.warn('Failed to delete discarded audio', url, err);
		});
	}

	return json({ committed, failed, discarded: discard.length });
};
