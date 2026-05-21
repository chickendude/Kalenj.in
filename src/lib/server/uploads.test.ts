import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({ env: { UPLOADS_DIR: '' } }));
vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));

const { saveUploadedImage, deleteUploadedImage, uploadsDir, UploadError } = await import('./uploads');

let dir: string;

function imageFile(type: string, bytes = 16): File {
	return new File([new Uint8Array(bytes)], 'pic', { type });
}

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), 'uploads-test-'));
	mocks.env.UPLOADS_DIR = dir;
});

afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('uploadsDir', () => {
	it('resolves to the configured directory', () => {
		expect(uploadsDir()).toBe(dir);
	});
});

describe('saveUploadedImage', () => {
	it('writes a supported image and returns a /media/<uuid>.<ext> url', async () => {
		const url = await saveUploadedImage(imageFile('image/png'));
		expect(url).toMatch(/^\/media\/[0-9a-f-]+\.png$/i);

		const files = await readdir(dir);
		expect(files).toContain(url.slice('/media/'.length));
	});

	it('maps each supported mime type to the right extension', async () => {
		expect(await saveUploadedImage(imageFile('image/jpeg'))).toMatch(/\.jpg$/);
		expect(await saveUploadedImage(imageFile('image/webp'))).toMatch(/\.webp$/);
		expect(await saveUploadedImage(imageFile('image/gif'))).toMatch(/\.gif$/);
	});

	it('rejects an empty file', async () => {
		await expect(saveUploadedImage(imageFile('image/png', 0))).rejects.toBeInstanceOf(UploadError);
	});

	it('rejects an oversized file', async () => {
		await expect(
			saveUploadedImage(imageFile('image/png', 10 * 1024 * 1024 + 1))
		).rejects.toThrow(/10 MB or smaller/);
	});

	it('rejects an unsupported mime type', async () => {
		await expect(saveUploadedImage(imageFile('image/svg+xml'))).rejects.toThrow(/Unsupported image type/);
	});
});

describe('deleteUploadedImage', () => {
	it('removes a previously saved image', async () => {
		const url = await saveUploadedImage(imageFile('image/png'));
		await deleteUploadedImage(url);
		const files = await readdir(dir);
		expect(files).not.toContain(url.slice('/media/'.length));
	});

	it('is a no-op for null/undefined and non-media urls', async () => {
		await expect(deleteUploadedImage(null)).resolves.toBeUndefined();
		await expect(deleteUploadedImage('/audio/x.mp3')).resolves.toBeUndefined();
	});

	it('refuses path-traversal filenames', async () => {
		await writeFile(join(dir, 'secret.txt'), 'x');
		await deleteUploadedImage('/media/../secret.txt');
		const files = await readdir(dir);
		expect(files).toContain('secret.txt');
	});

	it('is idempotent when the file is already gone', async () => {
		await expect(
			deleteUploadedImage('/media/00000000-0000-0000-0000-000000000000.png')
		).resolves.toBeUndefined();
	});
});
