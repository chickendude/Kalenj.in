import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Shared mutable env object; rawDir() reads AUDIO_UPLOAD_DIR at call time.
const mocks = vi.hoisted(() => ({ env: { AUDIO_UPLOAD_DIR: '' } }));
vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));

const { saveAudio, deleteAudio, readAudioFile } = await import('./audio-storage');

let dir: string;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), 'audio-storage-test-'));
	mocks.env.AUDIO_UPLOAD_DIR = dir;
});

afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('saveAudio', () => {
	it('writes the buffer and returns a /audio/<uuid>.mp3 url', async () => {
		const { filename, publicUrl } = await saveAudio(Buffer.from('clip'));

		expect(filename).toMatch(/^[0-9a-f-]+\.mp3$/i);
		expect(publicUrl).toBe(`/audio/${filename}`);
		const files = await readdir(dir);
		expect(files).toContain(filename);
	});
});

describe('readAudioFile', () => {
	it('reads back a saved file with its size', async () => {
		const { filename } = await saveAudio(Buffer.from('hello'));

		const result = await readAudioFile(filename);
		expect(result?.size).toBe(5);
		expect(result?.buffer.toString()).toBe('hello');
	});

	it('returns null for a missing file', async () => {
		await expect(readAudioFile('00000000-0000-0000-0000-000000000000.mp3')).resolves.toBeNull();
	});

	it('rejects filenames that do not match the expected pattern', async () => {
		await expect(readAudioFile('../escape.mp3')).resolves.toBeNull();
		await expect(readAudioFile('notmp3.txt')).resolves.toBeNull();
	});
});

describe('deleteAudio', () => {
	it('removes a previously saved file', async () => {
		const { filename, publicUrl } = await saveAudio(Buffer.from('bye'));
		await deleteAudio(publicUrl);
		const files = await readdir(dir);
		expect(files).not.toContain(filename);
	});

	it('is a no-op for null/undefined and non-audio urls', async () => {
		await expect(deleteAudio(null)).resolves.toBeUndefined();
		await expect(deleteAudio(undefined)).resolves.toBeUndefined();
		await expect(deleteAudio('/media/something.png')).resolves.toBeUndefined();
	});

	it('is idempotent when the file is already gone', async () => {
		await expect(
			deleteAudio('/audio/00000000-0000-0000-0000-000000000000.mp3')
		).resolves.toBeUndefined();
	});

	it('ignores urls whose filename fails the pattern check', async () => {
		await writeFile(join(dir, 'keep.txt'), 'x');
		await deleteAudio('/audio/keep.txt');
		const files = await readdir(dir);
		expect(files).toContain('keep.txt');
	});
});
