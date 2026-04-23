import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { env } from '$env/dynamic/private';

const DEFAULT_DIR = 'uploads';
const MAX_BYTES = 10 * 1024 * 1024;
const MIME_TO_EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif'
};

export function uploadsDir(): string {
	return resolve(env.UPLOADS_DIR || DEFAULT_DIR);
}

export class UploadError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UploadError';
	}
}

export async function saveUploadedImage(file: File): Promise<string> {
	if (file.size === 0) {
		throw new UploadError('Image file is empty.');
	}
	if (file.size > MAX_BYTES) {
		throw new UploadError('Image must be 10 MB or smaller.');
	}
	const ext = MIME_TO_EXT[file.type];
	if (!ext) {
		throw new UploadError('Unsupported image type. Use JPEG, PNG, WebP, or GIF.');
	}
	const dir = uploadsDir();
	await mkdir(dir, { recursive: true });
	const filename = `${randomUUID()}.${ext}`;
	const buffer = Buffer.from(await file.arrayBuffer());
	await writeFile(join(dir, filename), buffer);
	return `/media/${filename}`;
}

export async function deleteUploadedImage(url: string | null | undefined): Promise<void> {
	if (!url) return;
	const prefix = '/media/';
	if (!url.startsWith(prefix)) return;
	const filename = url.slice(prefix.length);
	if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
		return;
	}
	try {
		await unlink(join(uploadsDir(), filename));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
	}
}
