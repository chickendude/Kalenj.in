import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { normalizeToken } from '$lib/server/tokenize';
import type { RequestHandler } from './$types';

type SplitPayload = {
	tokenId?: string;
	splitPoints?: number[];
};
const TEMP_ORDER_SHIFT = 10_000;

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

async function ensureSentenceToken(sentenceId: string, tokenId: string) {
	const token = await prisma.exampleSentenceToken.findUnique({
		where: { id: tokenId },
		select: {
			id: true,
			exampleSentenceId: true,
			tokenOrder: true,
			surfaceForm: true
		}
	});

	if (!token || token.exampleSentenceId !== sentenceId) {
		error(404, 'Token not found for this sentence.');
	}

	return token;
}

export const POST: RequestHandler = async ({ params, request }) => {
	const payload = (await request.json()) as SplitPayload;
	const tokenId = clean(payload.tokenId);
	const splitPoints = Array.isArray(payload.splitPoints)
		? payload.splitPoints.filter((value) => Number.isInteger(value))
		: [];

	if (!tokenId) {
		return json({ error: 'Token is required.' }, { status: 400 });
	}

	const token = await ensureSentenceToken(params.id, tokenId);
	const surface = token.surfaceForm;

	if (splitPoints.length === 0) {
		return json(
			{
				error: `Choose at least one split point in "${surface}".`
			},
			{ status: 400 }
		);
	}
	const uniquePoints = [...new Set(splitPoints)].sort((a, b) => a - b);
	const invalidPoint = uniquePoints.find((point) => point <= 0 || point >= surface.length);
	if (invalidPoint !== undefined) {
		return json(
			{
				error: `Split points must be between 1 and ${Math.max(surface.length - 1, 1)}.`
			},
			{ status: 400 }
		);
	}

	const boundaries = [0, ...uniquePoints, surface.length];
	const segments = boundaries
		.slice(0, -1)
		.map((start, index) => ({
			surfaceForm: surface.slice(start, boundaries[index + 1])
		}))
		.filter((segment) => segment.surfaceForm.length > 0);

	const shiftBy = segments.length - 1;
	const createdTokens = await prisma.$transaction(async (tx) => {
		await tx.exampleSentenceToken.updateMany({
			where: {
				exampleSentenceId: token.exampleSentenceId,
				tokenOrder: { gt: token.tokenOrder }
			},
			data: { tokenOrder: { increment: TEMP_ORDER_SHIFT } }
		});
		await tx.exampleSentenceToken.updateMany({
			where: {
				exampleSentenceId: token.exampleSentenceId,
				tokenOrder: { gte: token.tokenOrder + TEMP_ORDER_SHIFT + 1 }
			},
			data: { tokenOrder: { decrement: TEMP_ORDER_SHIFT - shiftBy } }
		});

		const output: Array<Awaited<ReturnType<typeof tx.exampleSentenceToken.create>>> = [];
		const firstSegment = segments[0];
		const updated = await tx.exampleSentenceToken.update({
			where: { id: token.id },
			data: {
				surfaceForm: firstSegment.surfaceForm,
				normalizedForm: normalizeToken(firstSegment.surfaceForm)
			},
			include: { word: true }
		});
		output.push(updated);

		for (let index = 1; index < segments.length; index += 1) {
			const segment = segments[index];
			const created = await tx.exampleSentenceToken.create({
				data: {
					exampleSentenceId: token.exampleSentenceId,
					tokenOrder: token.tokenOrder + index,
					surfaceForm: segment.surfaceForm,
					normalizedForm: normalizeToken(segment.surfaceForm)
				},
				include: { word: true }
			});
			output.push(created);
		}

		return output;
	});

	await prisma.exampleSentence.update({
		where: { id: token.exampleSentenceId },
		data: { kalenjin: createdTokens.map((createdToken) => createdToken.surfaceForm).join(' ') }
	});

	return json({
		success: 'Token split.',
		tokenId: token.id,
		tokens: createdTokens
	});
};
