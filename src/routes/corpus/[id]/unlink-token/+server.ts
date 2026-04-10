import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import type { RequestHandler } from './$types';

type UnlinkTokenPayload = {
	tokenId?: string;
};

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

async function ensureSentenceToken(sentenceId: string, tokenId: string) {
	const token = await prisma.exampleSentenceToken.findUnique({
		where: { id: tokenId },
		select: { id: true, exampleSentenceId: true }
	});

	if (!token || token.exampleSentenceId !== sentenceId) {
		error(404, 'Token not found for this sentence.');
	}

	return token;
}

export const POST: RequestHandler = async ({ params, request }) => {
	const payload = (await request.json()) as UnlinkTokenPayload;
	const tokenId = clean(payload.tokenId);

	if (!tokenId) {
		return json({ error: 'Token is required.' }, { status: 400 });
	}

	await ensureSentenceToken(params.id, tokenId);

	await prisma.exampleSentenceToken.update({
		where: { id: tokenId },
		data: { wordId: null }
	});

	return json({
		success: 'Token unlinked.',
		tokenId
	});
};
