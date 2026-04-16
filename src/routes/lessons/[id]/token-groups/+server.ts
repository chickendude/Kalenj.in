import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import {
	planMergeTokenGroups,
	planSplitTokenGroup,
	planUpdateTokenGroupSurface
} from '$lib/server/token-group-edit';
import type { RequestHandler } from './$types';

type Payload =
	| {
			kind?: 'story' | 'example';
			action?: 'merge';
			sentenceId?: string;
			sourceTokenId?: string;
			targetTokenId?: string;
	  }
	| {
			kind?: 'story' | 'example';
			action?: 'split';
			sentenceId?: string;
			tokenId?: string;
	  }
	| {
			kind?: 'story' | 'example';
			action?: 'surface';
			sentenceId?: string;
			tokenId?: string;
			surfaceForm?: string;
	  };

const WORD_SELECT = {
	id: true,
	kalenjin: true,
	translations: true,
	notes: true,
	spellings: {
		orderBy: [{ spelling: 'asc' as const }],
		select: {
			id: true,
			spelling: true,
			spellingNormalized: true
		}
	}
};
const TEMP_ORDER_SHIFT = 10_000;

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

async function ensureStorySentence(lessonId: string, sentenceId: string) {
	const lesson = await prisma.lesson.findUnique({
		where: { id: lessonId },
		select: { storyId: true }
	});

	if (!lesson?.storyId) {
		error(404, 'Story lesson not found.');
	}

	const sentence = await prisma.storySentence.findUnique({
		where: { id: sentenceId },
		select: { id: true, storyId: true }
	});

	if (!sentence || sentence.storyId !== lesson.storyId) {
		error(404, 'Story sentence not found.');
	}
}

async function ensureExampleSentence(lessonId: string, sentenceId: string) {
	const lessonWord = await prisma.lessonWord.findFirst({
		where: {
			sentenceId,
			lessonSection: {
				lessonId
			}
		},
		select: { id: true }
	});

	if (!lessonWord) {
		error(404, 'Lesson sentence not found.');
	}
}

async function loadStoryTokens(sentenceId: string) {
	return prisma.storySentenceToken.findMany({
		where: { storySentenceId: sentenceId },
		orderBy: { tokenOrder: 'asc' },
		include: {
			word: {
				select: WORD_SELECT
			}
		}
	});
}

async function loadExampleTokens(sentenceId: string) {
	return prisma.exampleSentenceToken.findMany({
		where: { exampleSentenceId: sentenceId },
		orderBy: { tokenOrder: 'asc' },
		include: {
			word: {
				select: WORD_SELECT
			}
		}
	});
}

function buildSentenceText(tokens: Array<{ surfaceForm: string }>): string {
	return tokens.map((token) => token.surfaceForm).join(' ');
}

export const POST: RequestHandler = async ({ params, request }) => {
	const payload = (await request.json()) as Payload;
	const kind = payload.kind;
	const action = payload.action;
	const sentenceId = clean(payload.sentenceId);

	if (!sentenceId || (kind !== 'story' && kind !== 'example')) {
		return json({ error: 'Sentence is required.' }, { status: 400 });
	}

	if (kind === 'story') {
		await ensureStorySentence(params.id, sentenceId);
		const tokens = await prisma.storySentenceToken.findMany({
			where: { storySentenceId: sentenceId },
			orderBy: { tokenOrder: 'asc' },
			select: {
				id: true,
				tokenOrder: true,
				surfaceForm: true,
				wordId: true,
				inContextTranslation: true
			}
		});

		try {
			if (action === 'merge') {
				const sourceTokenId = clean(payload.sourceTokenId);
				const targetTokenId = clean(payload.targetTokenId);
				const merge = planMergeTokenGroups(tokens, sourceTokenId, targetTokenId);

				await prisma.$transaction(async (tx) => {
					await tx.storySentenceToken.update({
						where: { id: merge.keepTokenId },
						data: {
							surfaceForm: merge.surfaceForm,
							normalizedForm: merge.normalizedForm,
							wordId: merge.wordId,
							inContextTranslation: merge.inContextTranslation
						}
					});
					await tx.storySentenceToken.delete({ where: { id: merge.removeTokenId } });
					await tx.storySentenceToken.updateMany({
						where: {
							storySentenceId: sentenceId,
							tokenOrder: { gt: merge.removedTokenOrder }
						},
						data: { tokenOrder: { decrement: 1 } }
					});
				});
			} else if (action === 'split') {
				const tokenId = clean(payload.tokenId);
				const split = planSplitTokenGroup(tokens, tokenId);
				const firstPart = split.parts[0];
				const extraParts = split.parts.slice(1);

				await prisma.$transaction(async (tx) => {
					await tx.storySentenceToken.updateMany({
						where: {
							storySentenceId: sentenceId,
							tokenOrder: { gt: split.tokenOrder }
						},
						data: { tokenOrder: { increment: TEMP_ORDER_SHIFT } }
					});
					await tx.storySentenceToken.updateMany({
						where: {
							storySentenceId: sentenceId,
							tokenOrder: { gte: split.tokenOrder + TEMP_ORDER_SHIFT + 1 }
						},
						data: { tokenOrder: { decrement: TEMP_ORDER_SHIFT - extraParts.length } }
					});
					await tx.storySentenceToken.update({
						where: { id: split.tokenId },
						data: {
							surfaceForm: firstPart.surfaceForm,
							normalizedForm: firstPart.normalizedForm,
							inContextTranslation: firstPart.inContextTranslation
						}
					});
					await tx.storySentenceToken.createMany({
						data: extraParts.map((part, index) => ({
							storySentenceId: sentenceId,
							tokenOrder: split.tokenOrder + index + 1,
							surfaceForm: part.surfaceForm,
							normalizedForm: part.normalizedForm,
							inContextTranslation: part.inContextTranslation
						}))
					});
				});
			} else if (action === 'surface') {
				const tokenId = clean(payload.tokenId);
				const surfaceForm = clean(payload.surfaceForm);
				const update = planUpdateTokenGroupSurface(tokens, tokenId, surfaceForm);

				await prisma.storySentenceToken.update({
					where: { id: update.id },
					data: {
						surfaceForm: update.surfaceForm,
						normalizedForm: update.normalizedForm
					}
				});
			} else {
				return json({ error: 'Action is required.' }, { status: 400 });
			}
		} catch (editError) {
			return json(
				{
					error: editError instanceof Error ? editError.message : 'Could not update sentence words.'
				},
				{ status: 400 }
			);
		}

		const nextTokens = await loadStoryTokens(sentenceId);
		await prisma.storySentence.update({
			where: { id: sentenceId },
			data: { kalenjin: buildSentenceText(nextTokens) }
		});

		return json({
			tokens: nextTokens
		});
	}

	await ensureExampleSentence(params.id, sentenceId);
	const tokens = await prisma.exampleSentenceToken.findMany({
		where: { exampleSentenceId: sentenceId },
		orderBy: { tokenOrder: 'asc' },
		select: {
			id: true,
			tokenOrder: true,
			surfaceForm: true,
			wordId: true,
			inContextTranslation: true
		}
	});

	try {
		if (action === 'merge') {
			const sourceTokenId = clean(payload.sourceTokenId);
			const targetTokenId = clean(payload.targetTokenId);
			const merge = planMergeTokenGroups(tokens, sourceTokenId, targetTokenId);

			await prisma.$transaction(async (tx) => {
				await tx.exampleSentenceToken.update({
					where: { id: merge.keepTokenId },
					data: {
						surfaceForm: merge.surfaceForm,
						normalizedForm: merge.normalizedForm,
						wordId: merge.wordId,
						inContextTranslation: merge.inContextTranslation
					}
				});
				await tx.exampleSentenceToken.delete({ where: { id: merge.removeTokenId } });
				await tx.exampleSentenceToken.updateMany({
					where: {
						exampleSentenceId: sentenceId,
						tokenOrder: { gt: merge.removedTokenOrder }
					},
					data: { tokenOrder: { decrement: 1 } }
				});
			});
		} else if (action === 'split') {
			const tokenId = clean(payload.tokenId);
			const split = planSplitTokenGroup(tokens, tokenId);
			const firstPart = split.parts[0];
			const extraParts = split.parts.slice(1);

			await prisma.$transaction(async (tx) => {
				await tx.exampleSentenceToken.updateMany({
					where: {
						exampleSentenceId: sentenceId,
						tokenOrder: { gt: split.tokenOrder }
					},
					data: { tokenOrder: { increment: TEMP_ORDER_SHIFT } }
				});
				await tx.exampleSentenceToken.updateMany({
					where: {
						exampleSentenceId: sentenceId,
						tokenOrder: { gte: split.tokenOrder + TEMP_ORDER_SHIFT + 1 }
					},
					data: { tokenOrder: { decrement: TEMP_ORDER_SHIFT - extraParts.length } }
				});
				await tx.exampleSentenceToken.update({
					where: { id: split.tokenId },
					data: {
						surfaceForm: firstPart.surfaceForm,
						normalizedForm: firstPart.normalizedForm,
						inContextTranslation: firstPart.inContextTranslation
					}
				});
				await tx.exampleSentenceToken.createMany({
					data: extraParts.map((part, index) => ({
						exampleSentenceId: sentenceId,
						tokenOrder: split.tokenOrder + index + 1,
						surfaceForm: part.surfaceForm,
						normalizedForm: part.normalizedForm,
						inContextTranslation: part.inContextTranslation
					}))
				});
			});
		} else if (action === 'surface') {
			const tokenId = clean(payload.tokenId);
			const surfaceForm = clean(payload.surfaceForm);
			const update = planUpdateTokenGroupSurface(tokens, tokenId, surfaceForm);

			await prisma.exampleSentenceToken.update({
				where: { id: update.id },
				data: {
					surfaceForm: update.surfaceForm,
					normalizedForm: update.normalizedForm
				}
			});
		} else {
			return json({ error: 'Action is required.' }, { status: 400 });
		}
	} catch (editError) {
		return json(
			{
				error: editError instanceof Error ? editError.message : 'Could not update sentence words.'
			},
			{ status: 400 }
		);
	}

	const nextTokens = await loadExampleTokens(sentenceId);
	await prisma.exampleSentence.update({
		where: { id: sentenceId },
		data: { kalenjin: buildSentenceText(nextTokens) }
	});

	return json({
		tokens: nextTokens
	});
};
