import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';
import { prisma } from '$lib/server/prisma';
import { deleteAudio } from '$lib/server/audio-storage';

const MAX_ENTRIES = 100;

type TargetType = 'word' | 'sentence';
type KeepEntry = { targetId: string; audioUrl: string };

function isTargetType(value: unknown): value is TargetType {
	return value === 'word' || value === 'sentence';
}

function parseKeep(raw: unknown): KeepEntry[] {
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
		if (typeof targetId !== 'string' || !targetId) error(400, `keep[${i}] missing targetId.`);
		if (typeof audioUrl !== 'string' || !audioUrl) error(400, `keep[${i}] missing audioUrl.`);
		if (seen.has(targetId)) error(400, `Target ${targetId} appears more than once in keep.`);
		seen.add(targetId);
		entries.push({ targetId, audioUrl });
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

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireEditor(locals);

	const payload = await request.json().catch(() => null);
	if (!payload || typeof payload !== 'object') error(400, 'Invalid request body.');
	const targetTypeRaw = (payload as { targetType?: unknown }).targetType ?? 'word';
	if (!isTargetType(targetTypeRaw)) error(400, 'Invalid targetType.');
	const targetType: TargetType = targetTypeRaw;

	const keep = parseKeep((payload as { keep?: unknown }).keep);
	const discard = parseDiscard((payload as { discard?: unknown }).discard);

	if (keep.length === 0 && discard.length === 0) {
		error(400, 'No keep or discard entries provided.');
	}

	const committed: { targetId: string; audioUrl: string }[] = [];
	const failed: { targetId: string; reason: string }[] = [];

	if (keep.length > 0) {
		const ids = keep.map((e) => e.targetId);
		const existing =
			targetType === 'word'
				? await prisma.word.findMany({
						where: { id: { in: ids } },
						select: { id: true, audioUrl: true }
					})
				: await prisma.exampleSentence.findMany({
						where: { id: { in: ids } },
						select: { id: true, audioUrl: true }
					});
		const existingById = new Map(existing.map((row) => [row.id, row.audioUrl]));

		const now = new Date();
		for (const entry of keep) {
			if (!existingById.has(entry.targetId)) {
				failed.push({
					targetId: entry.targetId,
					reason: `${targetType === 'word' ? 'Word' : 'Sentence'} not found.`
				});
				continue;
			}
			const previousUrl = existingById.get(entry.targetId) ?? null;
			const data = {
				audioUrl: entry.audioUrl,
				audioRecordedById: user.id,
				audioRecordedAt: now
			};
			if (targetType === 'word') {
				await prisma.word.update({ where: { id: entry.targetId }, data });
			} else {
				await prisma.exampleSentence.update({ where: { id: entry.targetId }, data });
			}
			if (previousUrl && previousUrl !== entry.audioUrl) {
				await deleteAudio(previousUrl).catch((err) => {
					console.warn('Failed to delete previous audio', previousUrl, err);
				});
			}
			committed.push({ targetId: entry.targetId, audioUrl: entry.audioUrl });
		}
	}

	for (const url of discard) {
		await deleteAudio(url).catch((err) => {
			console.warn('Failed to delete discarded audio', url, err);
		});
	}

	return json({ committed, failed, discarded: discard.length });
};
