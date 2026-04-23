import { error } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { uploadsDir } from '$lib/server/uploads';
import type { RequestHandler } from './$types';

const CONTENT_TYPES: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.gif': 'image/gif'
};

export const GET: RequestHandler = async ({ params }) => {
	const { filename } = params;
	if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
		error(400, 'Invalid filename');
	}
	const ext = extname(filename).toLowerCase();
	const contentType = CONTENT_TYPES[ext];
	if (!contentType) {
		error(404, 'Not found');
	}
	const path = join(uploadsDir(), filename);
	let size: number;
	try {
		const info = await stat(path);
		if (!info.isFile()) error(404, 'Not found');
		size = info.size;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') error(404, 'Not found');
		throw err;
	}
	const nodeStream = createReadStream(path);
	const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
	return new Response(webStream, {
		headers: {
			'content-type': contentType,
			'content-length': String(size),
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
};
