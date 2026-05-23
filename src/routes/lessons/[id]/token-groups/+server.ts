import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => {
	error(410, 'Story sentence tokens are edited through the linked corpus sentence.');
};
