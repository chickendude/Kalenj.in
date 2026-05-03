import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';
import { prisma } from '$lib/server/prisma';
import { deleteAudio } from '$lib/server/audio-storage';

const MAX_ENTRIES = 100;

type KeepEntry = { wordId: string; audioUrl: string };

function parseKeep(raw: unknown): KeepEntry[] {
	if (raw === undefined || raw === null) return [];
	if (!Array.isArray(raw)) error(400, 'keep must be an array.');
	if (raw.length > MAX_ENTRIES) error(400, `Too many keep entries (max ${MAX_ENTRIES}).`);

	const seen = new Set<string>();
	const entries: KeepEntry[] = [];
	for (let i = 0; i < raw.length; i += 1) {
		const item: unknown = raw[i];
		if (!item || typeof item !== 'object') error(400, `keep[${i}] is not an object.`);
		const wordId: unknown = (item as { wordId?: unknown }).wordId;
		const audioUrl: unknown = (item as { audioUrl?: unknown }).audioUrl;
		if (typeof wordId !== 'string' || !wordId) error(400, `keep[${i}] missing wordId.`);
		if (typeof audioUrl !== 'string' || !audioUrl) error(400, `keep[${i}] missing audioUrl.`);
		if (seen.has(wordId)) error(400, `Word ${wordId} appears more than once in keep.`);
		seen.add(wordId);
		entries.push({ wordId, audioUrl });
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
	requireEditor(locals);

	const payload = await request.json().catch(() => null);
	if (!payload || typeof payload !== 'object') error(400, 'Invalid request body.');
	const keep = parseKeep((payload as { keep?: unknown }).keep);
	const discard = parseDiscard((payload as { discard?: unknown }).discard);

	if (keep.length === 0 && discard.length === 0) {
		error(400, 'No keep or discard entries provided.');
	}

	const committed: { wordId: string; audioUrl: string }[] = [];
	const failed: { wordId: string; reason: string }[] = [];

	if (keep.length > 0) {
		const existing = await prisma.word.findMany({
			where: { id: { in: keep.map((e) => e.wordId) } },
			select: { id: true, audioUrl: true }
		});
		const existingById = new Map(existing.map((w) => [w.id, w.audioUrl]));

		for (const entry of keep) {
			if (!existingById.has(entry.wordId)) {
				failed.push({ wordId: entry.wordId, reason: 'Word not found.' });
				continue;
			}
			const previousUrl = existingById.get(entry.wordId) ?? null;
			await prisma.word.update({
				where: { id: entry.wordId },
				data: { audioUrl: entry.audioUrl }
			});
			if (previousUrl && previousUrl !== entry.audioUrl) {
				await deleteAudio(previousUrl).catch((err) => {
					console.warn('Failed to delete previous audio', previousUrl, err);
				});
			}
			committed.push({ wordId: entry.wordId, audioUrl: entry.audioUrl });
		}
	}

	for (const url of discard) {
		await deleteAudio(url).catch((err) => {
			console.warn('Failed to delete discarded audio', url, err);
		});
	}

	return json({ committed, failed, discarded: discard.length });
};
