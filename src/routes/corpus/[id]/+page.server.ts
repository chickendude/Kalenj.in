import { error, fail, redirect } from '@sveltejs/kit';
import { Prisma, type PartOfSpeech } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { prepareAlternativeSpellings } from '$lib/server/kalenjin-word-search';
import { normalizeLemma } from '$lib/server/normalize-lemma';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import type { Actions, PageServerLoad } from './$types';

function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

function readOptionalText(formData: FormData, key: string): string | null {
	const value = readText(formData, key);
	return value.length > 0 ? value : null;
}

function buildWordSelect() {
	return {
		id: true,
		kalenjin: true,
		translations: true,
		notes: true,
		partOfSpeech: true,
		pluralForm: true,
		spellings: {
			orderBy: [{ spelling: 'asc' as const }],
			select: {
				id: true,
				spelling: true,
				spellingNormalized: true
			}
		}
	};
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

async function ensureSentenceTokenSegment(
	sentenceId: string,
	tokenId: string,
	segmentId: string
): Promise<string> {
	const segment = await prisma.exampleSentenceTokenSegment.findUnique({
		where: { id: segmentId },
		select: {
			tokenId: true,
			token: {
				select: { exampleSentenceId: true }
			}
		}
	});

	if (!segment || segment.tokenId !== tokenId || segment.token.exampleSentenceId !== sentenceId) {
		error(404, 'Token segment not found for this sentence.');
	}

	return segmentId;
}

async function createOrUpdateLinkedWord(
	tx: Prisma.TransactionClient,
	input: {
		wordId?: string | null;
		kalenjin: string;
		translations: string;
		notes?: string | null;
		alternativeSpellings?: string | null;
		partOfSpeech?: PartOfSpeech | null;
		pluralForm?: string | null;
	}
) {
	const spellings = prepareAlternativeSpellings(input.alternativeSpellings ?? '', input.kalenjin);
	const pluralForm = input.pluralForm ?? null;
	const pluralFormNormalized = pluralForm ? normalizeLemma(pluralForm) : null;

	if (input.wordId) {
		return tx.word.update({
			where: { id: input.wordId },
			data: {
				kalenjin: input.kalenjin,
				kalenjinNormalized: normalizeLemma(input.kalenjin),
				translations: input.translations,
				notes: input.notes ?? null,
				partOfSpeech: input.partOfSpeech ?? null,
				pluralForm,
				pluralFormNormalized,
				spellings: {
					deleteMany: {},
					createMany: spellings.length
						? {
								data: spellings
							}
						: undefined
				}
			},
			select: buildWordSelect()
		});
	}

	return tx.word.create({
		data: {
			kalenjin: input.kalenjin,
			kalenjinNormalized: normalizeLemma(input.kalenjin),
			translations: input.translations,
			notes: input.notes ?? null,
			partOfSpeech: input.partOfSpeech ?? null,
			pluralForm,
			pluralFormNormalized,
			spellings: spellings.length
				? {
						createMany: {
							data: spellings
						}
					}
				: undefined
		},
		select: buildWordSelect()
	});
}

export const load: PageServerLoad = async ({ params }) => {
	const [sentence, words] = await Promise.all([
		prisma.exampleSentence.findUnique({
			where: { id: params.id },
			include: {
				tokens: {
					orderBy: { tokenOrder: 'asc' },
					include: {
						word: {
							select: buildWordSelect()
						},
						segments: {
							orderBy: { segmentOrder: 'asc' },
							include: {
								word: {
									select: buildWordSelect()
								}
							}
						}
					}
				}
			}
		}),
		prisma.word.findMany({
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: 500
		})
	]);

	if (!sentence) {
		error(404, 'Sentence not found');
	}

	return {
		sentence,
		words
	};
};

export const actions: Actions = {
	updateCorpusSentenceToken: async ({ request, params, locals }) => {
		requireEditor(locals);
		const formData = await request.formData();
		const sentenceId = readText(formData, 'sentenceId');
		const tokenId = readText(formData, 'tokenId');
		const segmentId = readOptionalText(formData, 'segmentId');
		const wordId = readOptionalText(formData, 'wordId');
		const inContextTranslation = readOptionalText(formData, 'inContextTranslation');

		if (!sentenceId || !tokenId) {
			return fail(400, { error: 'Sentence and token are required.' });
		}

		if (sentenceId !== params.id) {
			return fail(404, { error: 'Sentence not found.' });
		}

		const sentenceToken = await ensureSentenceToken(params.id, tokenId);
		const checkedSegmentId = segmentId
			? await ensureSentenceTokenSegment(params.id, tokenId, segmentId)
			: null;

		const updatedToken = await prisma.$transaction(async (tx) => {
			if (checkedSegmentId) {
				await tx.exampleSentenceTokenSegment.update({
					where: { id: checkedSegmentId },
					data: { wordId }
				});

				if (wordId) {
					await tx.wordSentence.upsert({
						where: {
							wordId_exampleSentenceId: {
								wordId,
								exampleSentenceId: sentenceToken.exampleSentenceId
							}
						},
						update: {},
						create: {
							wordId,
							exampleSentenceId: sentenceToken.exampleSentenceId
						}
					});
				}

				return tx.exampleSentenceToken.findUniqueOrThrow({
					where: { id: tokenId },
					include: {
						word: {
							select: buildWordSelect()
						},
						segments: {
							orderBy: { segmentOrder: 'asc' },
							include: {
								word: {
									select: buildWordSelect()
								}
							}
						}
					}
				});
			}

			const updatedToken = await tx.exampleSentenceToken.update({
				where: { id: tokenId },
				data: {
					wordId,
					inContextTranslation
				},
				include: {
					word: {
						select: buildWordSelect()
					},
					segments: {
						orderBy: { segmentOrder: 'asc' },
						include: {
							word: {
								select: buildWordSelect()
							}
						}
					}
				}
			});

			if (wordId) {
				await tx.wordSentence.upsert({
					where: {
						wordId_exampleSentenceId: {
							wordId,
							exampleSentenceId: sentenceToken.exampleSentenceId
						}
					},
					update: {},
					create: {
						wordId,
						exampleSentenceId: sentenceToken.exampleSentenceId
					}
				});
			}

			return updatedToken;
		});

		return {
			updateCorpusSentenceTokenSuccess: true,
			tokenUpdates: [
				{
					tokenId: updatedToken.id,
					wordId: updatedToken.wordId,
					inContextTranslation: updatedToken.inContextTranslation,
					word: updatedToken.word,
					segments: updatedToken.segments
				}
			]
		};
	},
	createCorpusSentenceWord: async ({ request, params, locals }) => {
		requireEditor(locals);
		const formData = await request.formData();
		const sentenceId = readText(formData, 'sentenceId');
		const tokenId = readText(formData, 'tokenId');
		const segmentId = readOptionalText(formData, 'segmentId');
		const wordId = readOptionalText(formData, 'wordId');
		const kalenjin = readText(formData, 'kalenjin');
		const translations = readText(formData, 'translations');
		const notes = readOptionalText(formData, 'notes');
		const alternativeSpellings = readOptionalText(formData, 'alternativeSpellings');
		const inContextTranslation = readOptionalText(formData, 'inContextTranslation');
		const partOfSpeechRaw = readOptionalText(formData, 'partOfSpeech');
		const pluralForm = readOptionalText(formData, 'pluralForm');

		if (!sentenceId || !tokenId || !kalenjin || !translations) {
			return fail(400, {
				error: 'Sentence token, lemma, and translations are required.'
			});
		}

		if (sentenceId !== params.id) {
			return fail(404, { error: 'Sentence not found.' });
		}

		if (partOfSpeechRaw && !isPartOfSpeech(partOfSpeechRaw)) {
			return fail(400, { error: 'Invalid part of speech value.' });
		}

		const partOfSpeech: PartOfSpeech | null = partOfSpeechRaw
			? (partOfSpeechRaw as PartOfSpeech)
			: null;

		const sentenceToken = await ensureSentenceToken(params.id, tokenId);
		const checkedSegmentId = segmentId
			? await ensureSentenceTokenSegment(params.id, tokenId, segmentId)
			: null;

		try {
			const { token: updatedToken } = await prisma.$transaction(async (tx) => {
				const word = await createOrUpdateLinkedWord(tx, {
					wordId,
					kalenjin,
					translations,
					notes,
					alternativeSpellings,
					partOfSpeech,
					pluralForm: partOfSpeech === 'NOUN' || partOfSpeech === 'ADJECTIVE' ? pluralForm : null
				});

				if (checkedSegmentId) {
					await tx.exampleSentenceTokenSegment.update({
						where: { id: checkedSegmentId },
						data: { wordId: word.id }
					});
				} else {
					await tx.exampleSentenceToken.update({
						where: { id: tokenId },
						data: {
							wordId: word.id,
							inContextTranslation
						}
					});
				}

				await tx.wordSentence.upsert({
					where: {
						wordId_exampleSentenceId: {
							wordId: word.id,
							exampleSentenceId: sentenceToken.exampleSentenceId
						}
					},
					update: {},
					create: {
						wordId: word.id,
						exampleSentenceId: sentenceToken.exampleSentenceId
					}
				});

				const token = await tx.exampleSentenceToken.findUniqueOrThrow({
					where: { id: tokenId },
					include: {
						word: {
							select: buildWordSelect()
						},
						segments: {
							orderBy: { segmentOrder: 'asc' },
							include: {
								word: {
									select: buildWordSelect()
								}
							}
						}
					}
				});

				return { word, token };
			});

			return {
				createCorpusSentenceWordSuccess: true,
				tokenUpdates: [
					{
						tokenId,
						wordId: updatedToken.wordId,
						inContextTranslation: updatedToken.inContextTranslation,
						word: updatedToken.word,
						segments: updatedToken.segments
					}
				]
			};
		} catch (createError) {
			return fail(400, {
				error:
					createError instanceof Error ? createError.message : 'Could not create or link lemma.'
			});
		}
	},
	deleteSentence: async ({ params, locals }) => {
		requireEditor(locals);

		const existing = await prisma.exampleSentence.findUnique({
			where: { id: params.id },
			select: {
				id: true,
				storySentenceId: true,
				_count: { select: { lessonWords: true } }
			}
		});

		if (!existing) {
			error(404, 'Sentence not found');
		}

		if (existing._count.lessonWords > 0) {
			return fail(409, {
				error:
					'This sentence is used in a lesson. Remove it from the lesson before deleting.'
			});
		}

		if (existing.storySentenceId) {
			return fail(409, {
				error: 'This sentence comes from a story lesson. Edit or delete it from the story lesson.'
			});
		}

		await prisma.exampleSentence.delete({ where: { id: params.id } });

		redirect(303, '/corpus');
	}
};
