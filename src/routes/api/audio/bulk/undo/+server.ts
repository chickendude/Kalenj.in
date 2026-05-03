import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';
import { prisma } from '$lib/server/prisma';
import { deleteAudio } from '$lib/server/audio-storage';

const MAX_ENTRIES = 100;

type Entry = {
	wordId: string;
	audioUrl: string;
};

function parseEntries(raw: unknown): Entry[] {
	if (!Array.isArray(raw)) error(400, 'Entries must be an array.');
	if (raw.length === 0) error(400, 'No entries provided.');
	if (raw.length > MAX_ENTRIES) error(400, `Too many entries (max ${MAX_ENTRIES}).`);

	const seen = new Set<string>();
	const entries: Entry[] = [];
	for (let i = 0; i < raw.length; i += 1) {
		const item: unknown = raw[i];
		if (!item || typeof item !== 'object') error(400, `Entry ${i} is not an object.`);
		const wordId: unknown = (item as { wordId?: unknown }).wordId;
		const audioUrl: unknown = (item as { audioUrl?: unknown }).audioUrl;
		if (typeof wordId !== 'string' || !wordId) error(400, `Entry ${i} is missing wordId.`);
		if (typeof audioUrl !== 'string' || !audioUrl) error(400, `Entry ${i} is missing audioUrl.`);
		if (seen.has(wordId)) error(400, `Word ${wordId} appears more than once.`);
		seen.add(wordId);
		entries.push({ wordId, audioUrl });
	}
	return entries;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	requireEditor(locals);

	const payload = await request.json().catch(() => null);
	if (!payload || typeof payload !== 'object') error(400, 'Invalid request body.');
	const entries = parseEntries((payload as { entries?: unknown }).entries);

	const current = await prisma.word.findMany({
		where: { id: { in: entries.map((e) => e.wordId) } },
		select: { id: true, audioUrl: true }
	});
	const currentByWord = new Map(current.map((w) => [w.id, w.audioUrl]));

	const undone: string[] = [];
	const skipped: { wordId: string; reason: string }[] = [];

	for (const entry of entries) {
		const liveUrl = currentByWord.get(entry.wordId);
		if (liveUrl === undefined) {
			skipped.push({ wordId: entry.wordId, reason: 'Word not found.' });
			continue;
		}
		if (liveUrl !== entry.audioUrl) {
			skipped.push({
				wordId: entry.wordId,
				reason: 'Audio has changed since the session was saved.'
			});
			continue;
		}
		await prisma.word.update({
			where: { id: entry.wordId },
			data: { audioUrl: null }
		});
		await deleteAudio(entry.audioUrl).catch((err) => {
			console.warn('Failed to delete audio file during undo', entry.audioUrl, err);
		});
		undone.push(entry.wordId);
	}

	return json({ undone, skipped });
};
