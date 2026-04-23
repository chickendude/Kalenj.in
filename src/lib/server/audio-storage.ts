import { mkdir, unlink, stat, readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { env } from '$env/dynamic/private';

const AUDIO_URL_PREFIX = '/audio/';
const FILENAME_PATTERN = /^[0-9a-f-]+\.mp3$/i;

function rawDir(): string {
	return env.AUDIO_UPLOAD_DIR?.trim() || './.uploads/audio';
}

export function getAudioDir(): string {
	return resolve(rawDir());
}

async function ensureDir(): Promise<string> {
	const dir = getAudioDir();
	await mkdir(dir, { recursive: true });
	return dir;
}

export async function saveAudio(buffer: Buffer): Promise<{ filename: string; publicUrl: string }> {
	const dir = await ensureDir();
	const filename = `${randomUUID()}.mp3`;
	await writeFile(join(dir, filename), buffer);
	return { filename, publicUrl: `${AUDIO_URL_PREFIX}${filename}` };
}

function filenameFromUrl(publicUrl: string): string | null {
	if (!publicUrl.startsWith(AUDIO_URL_PREFIX)) return null;
	const filename = publicUrl.slice(AUDIO_URL_PREFIX.length);
	if (!FILENAME_PATTERN.test(filename)) return null;
	return filename;
}

export async function deleteAudio(publicUrl: string | null | undefined): Promise<void> {
	if (!publicUrl) return;
	const filename = filenameFromUrl(publicUrl);
	if (!filename) return;
	const dir = getAudioDir();
	try {
		await unlink(join(dir, filename));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
	}
}

export async function readAudioFile(
	filename: string
): Promise<{ buffer: Buffer; size: number } | null> {
	if (!FILENAME_PATTERN.test(filename)) return null;
	const dir = getAudioDir();
	const path = join(dir, filename);
	try {
		const [buffer, stats] = await Promise.all([readFile(path), stat(path)]);
		return { buffer, size: stats.size };
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw err;
	}
}
