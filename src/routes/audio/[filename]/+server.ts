import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readAudioFile } from '$lib/server/audio-storage';

export const GET: RequestHandler = async ({ params }) => {
	const file = await readAudioFile(params.filename);
	if (!file) error(404, 'Not Found');

	return new Response(new Uint8Array(file.buffer), {
		headers: {
			'Content-Type': 'audio/mpeg',
			'Content-Length': String(file.size),
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
