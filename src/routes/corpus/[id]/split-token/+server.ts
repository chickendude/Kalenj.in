import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { temporaryTokenOrderUpdates } from '$lib/server/token-order';
import { normalizeToken } from '$lib/server/tokenize';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';

type SplitPayload = {
	tokenId?: string;
	splitPoints?: number[];
};

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

export const POST: RequestHandler = async ({ params, request, locals }) => {
	requireEditor(locals);
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

	const sentenceTokens = await prisma.exampleSentenceToken.findMany({
		where: { exampleSentenceId: token.exampleSentenceId },
		orderBy: { tokenOrder: 'asc' },
		select: {
			id: true,
			tokenOrder: true
		}
	});

	const { sentenceText, splitTokens } = await prisma.$transaction(async (tx) => {
		for (const update of temporaryTokenOrderUpdates(sentenceTokens)) {
			await tx.exampleSentenceToken.update({
				where: { id: update.id },
				data: { tokenOrder: update.tokenOrder }
			});
		}

		const output: Array<Awaited<ReturnType<typeof tx.exampleSentenceToken.create>>> = [];
		const sentenceSurfaces: string[] = [];
		let nextOrder = 0;

		for (const existingToken of sentenceTokens) {
			if (existingToken.id !== token.id) {
				const updated = await tx.exampleSentenceToken.update({
					where: { id: existingToken.id },
					data: { tokenOrder: nextOrder },
					select: { surfaceForm: true }
				});
				sentenceSurfaces.push(updated.surfaceForm);
				nextOrder += 1;
				continue;
			}

			for (let index = 0; index < segments.length; index += 1) {
				const segment = segments[index];
				if (index === 0) {
					const updated = await tx.exampleSentenceToken.update({
						where: { id: token.id },
						data: {
							tokenOrder: nextOrder,
							surfaceForm: segment.surfaceForm,
							normalizedForm: normalizeToken(segment.surfaceForm)
						},
						include: { word: true }
					});
					output.push(updated);
					sentenceSurfaces.push(updated.surfaceForm);
				} else {
					const created = await tx.exampleSentenceToken.create({
						data: {
							exampleSentenceId: token.exampleSentenceId,
							tokenOrder: nextOrder,
							surfaceForm: segment.surfaceForm,
							normalizedForm: normalizeToken(segment.surfaceForm)
						},
						include: { word: true }
					});
					output.push(created);
					sentenceSurfaces.push(created.surfaceForm);
				}
				nextOrder += 1;
			}
		}

		return {
			sentenceText: sentenceSurfaces.join(' '),
			splitTokens: output
		};
	});

	await prisma.exampleSentence.update({
		where: { id: token.exampleSentenceId },
		data: { kalenjin: sentenceText }
	});

	return json({
		success: 'Token split.',
		tokenId: token.id,
		tokens: splitTokens
	});
};
