import { error, fail, redirect } from '@sveltejs/kit';
import { Prisma, type ExampleSentenceStatus, type PartOfSpeech } from '@prisma/client';

const SENTENCE_STATUSES = ['NEEDS_PROOFREAD', 'IN_CORPUS', 'STORY_ONLY'] as const satisfies readonly ExampleSentenceStatus[];
const SENTENCE_STATUS_SET: ReadonlySet<string> = new Set(SENTENCE_STATUSES);
import { isPartOfSpeech } from '$lib/parts-of-speech';
import { combinePluralFormVariants } from '$lib/plural-form-variants';
import { autoLemmatizeMissingExampleSentenceWords } from '$lib/server/auto-lemma';
import { replaceObservedWordForm } from '$lib/server/observed-word-forms';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import {
	buildSentenceStoryLinks,
	sentenceStoryLinkSelect
} from '$lib/server/sentence-story-links';
import {
	buildWordSelect,
	createOrUpdateLinkedWord,
	readPresentTenseFromFormData
} from '$lib/server/lemma-words';
import { deleteUploadedImage, saveUploadedImage, UploadError } from '$lib/server/uploads';
import type { Actions, PageServerLoad } from './$types';

function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

function readOptionalText(formData: FormData, key: string): string | null {
	const value = readText(formData, key);
	return value.length > 0 ? value : null;
}

function autoLemmaSentenceMessage(summary: {
	scannedSentences: number;
	updatedSentences: number;
	linkedWords: number;
	translatedWords: number;
}): string {
	if (summary.scannedSentences === 0) {
		return 'No missing lemma or context translation fields found in this sentence.';
	}
	if (summary.linkedWords === 0 && summary.translatedWords === 0) {
		return 'No automatic lemma matches found for this sentence.';
	}
	if (summary.linkedWords === 0) {
		return `Filled ${summary.translatedWords} context translation${
			summary.translatedWords === 1 ? '' : 's'
		}; sentence queued for proofread.`;
	}
	if (summary.translatedWords === 0) {
		return `Linked ${summary.linkedWords} missing word${
			summary.linkedWords === 1 ? '' : 's'
		}; sentence queued for proofread.`;
	}

	return `Linked ${summary.linkedWords} missing word${
		summary.linkedWords === 1 ? '' : 's'
	} and filled ${summary.translatedWords} context translation${
		summary.translatedWords === 1 ? '' : 's'
	}; sentence queued for proofread.`;
}

const sentenceIncludeBase = {
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
} satisfies Prisma.ExampleSentenceInclude;

const sentenceIncludeWithStory = {
	...sentenceIncludeBase,
	storySentence: { select: sentenceStoryLinkSelect }
} satisfies Prisma.ExampleSentenceInclude;

type SentenceDetailRow = Prisma.ExampleSentenceGetPayload<{
	include: typeof sentenceIncludeWithStory;
}>;

async function ensureSentenceToken(sentenceId: string, tokenId: string) {
	const token = await prisma.exampleSentenceToken.findUnique({
		where: { id: tokenId },
		select: { id: true, exampleSentenceId: true, wordId: true, normalizedForm: true }
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
): Promise<{ id: string; wordId: string | null; normalizedForm: string }> {
	const segment = await prisma.exampleSentenceTokenSegment.findUnique({
		where: { id: segmentId },
		select: {
			id: true,
			tokenId: true,
			wordId: true,
			normalizedForm: true,
			token: {
				select: { exampleSentenceId: true }
			}
		}
	});

	if (!segment || segment.tokenId !== tokenId || segment.token.exampleSentenceId !== sentenceId) {
		error(404, 'Token segment not found for this sentence.');
	}

	return {
		id: segment.id,
		wordId: segment.wordId,
		normalizedForm: segment.normalizedForm
	};
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const isAdmin = locals.user?.role === 'ADMIN';
	const [sentence, words, ignoredForms] = await Promise.all([
		prisma.exampleSentence.findUnique({
			where: { id: params.id },
			include: isAdmin ? sentenceIncludeWithStory : sentenceIncludeBase
		}),
		prisma.word.findMany({
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: 500
		}),
		prisma.ignoredWordForm.findMany({ select: { normalizedForm: true } })
	]);

	if (!sentence) {
		error(404, 'Sentence not found');
	}

	const sentenceForLinks = sentence as SentenceDetailRow;
	const { storySentence: _storySentence, ...sentenceData } = sentenceForLinks;

	return {
		sentence: {
			...sentenceData,
			storyLinks: isAdmin ? buildSentenceStoryLinks(sentenceForLinks) : []
		},
		words,
		ignoredNormalizedForms: ignoredForms.map((entry) => entry.normalizedForm)
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
		const checkedSegment = segmentId
			? await ensureSentenceTokenSegment(params.id, tokenId, segmentId)
			: null;

		const updatedToken = await prisma.$transaction(async (tx) => {
			if (checkedSegment) {
				const updatedSegment = await tx.exampleSentenceTokenSegment.update({
					where: { id: checkedSegment.id },
					data: { wordId },
					select: { wordId: true, normalizedForm: true }
				});
				await replaceObservedWordForm(tx, checkedSegment, updatedSegment);

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

			await replaceObservedWordForm(tx, sentenceToken, updatedToken);

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
		const isPluralOnlyRaw = readText(formData, 'isPluralOnly');
		const alternativePluralForms = readOptionalText(formData, 'alternativePluralForms');

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

		const canHavePlural = partOfSpeech === 'NOUN' || partOfSpeech === 'ADJECTIVE';
		const isPluralOnly = canHavePlural && isPluralOnlyRaw === 'on';

		const presentTense =
			partOfSpeech === 'VERB' ? readPresentTenseFromFormData(formData) : null;

		const sentenceToken = await ensureSentenceToken(params.id, tokenId);
		const checkedSegment = segmentId
			? await ensureSentenceTokenSegment(params.id, tokenId, segmentId)
			: null;

		const imageFile = formData.get('image');
		let imageUrl: string | null | undefined = undefined;
		if (imageFile instanceof File && imageFile.size > 0) {
			try {
				imageUrl = await saveUploadedImage(imageFile);
			} catch (err) {
				if (err instanceof UploadError) {
					return fail(400, { error: err.message });
				}
				throw err;
			}
		}

		try {
			const { token: updatedToken } = await prisma.$transaction(async (tx) => {
				const word = await createOrUpdateLinkedWord(tx, {
					wordId,
					kalenjin,
					translations,
					notes,
					alternativeSpellings,
					partOfSpeech,
					pluralForm:
						canHavePlural && !isPluralOnly
							? combinePluralFormVariants(pluralForm, alternativePluralForms)
							: null,
					isPluralOnly,
					presentTense,
					...(imageUrl !== undefined ? { imageUrl } : {})
				});

				if (checkedSegment) {
					const updatedSegment = await tx.exampleSentenceTokenSegment.update({
						where: { id: checkedSegment.id },
						data: { wordId: word.id },
						select: { wordId: true, normalizedForm: true }
					});
					await replaceObservedWordForm(tx, checkedSegment, updatedSegment);
				} else {
					const updatedSentenceToken = await tx.exampleSentenceToken.update({
						where: { id: tokenId },
						data: {
							wordId: word.id,
							inContextTranslation
						},
						select: { wordId: true, normalizedForm: true }
					});
					await replaceObservedWordForm(tx, sentenceToken, updatedSentenceToken);
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
			if (imageUrl) {
				await deleteUploadedImage(imageUrl);
			}
			return fail(400, {
				error:
					createError instanceof Error ? createError.message : 'Could not create or link lemma.'
			});
		}
	},
	updateSentenceImage: async ({ request, params, locals }) => {
		requireEditor(locals);
		const current = await prisma.exampleSentence.findUnique({
			where: { id: params.id },
			select: { imageUrl: true }
		});
		if (!current) error(404, 'Sentence not found');

		const formData = await request.formData();
		const imageFile = formData.get('image');
		const removeImage = formData.get('removeImage') === '1';

		let newImageUrl: string | null | undefined = undefined;
		if (imageFile instanceof File && imageFile.size > 0) {
			try {
				newImageUrl = await saveUploadedImage(imageFile);
			} catch (err) {
				if (err instanceof UploadError) return fail(400, { error: err.message });
				throw err;
			}
		} else if (removeImage) {
			newImageUrl = null;
		}

		if (newImageUrl === undefined) {
			return { updateSentenceImageSuccess: true };
		}

		try {
			await prisma.exampleSentence.update({
				where: { id: params.id },
				data: { imageUrl: newImageUrl }
			});
		} catch (err) {
			if (typeof newImageUrl === 'string') await deleteUploadedImage(newImageUrl);
			throw err;
		}

		if (current.imageUrl && current.imageUrl !== newImageUrl) {
			await deleteUploadedImage(current.imageUrl);
		}

		return { updateSentenceImageSuccess: true };
	},
	autoLemmatizeSentence: async ({ params, locals }) => {
		requireEditor(locals);
		const summary = await autoLemmatizeMissingExampleSentenceWords(prisma, {
			sentenceId: params.id
		});

		return { autoLemmaSuccess: autoLemmaSentenceMessage(summary) };
	},
	setSentenceStatus: async ({ params, request, locals }) => {
		requireEditor(locals);
		const formData = await request.formData();
		const rawStatus = String(formData.get('status') ?? '').trim();

		if (!SENTENCE_STATUS_SET.has(rawStatus)) {
			return fail(400, { error: `Unknown sentence status: "${rawStatus}".` });
		}

		const status = rawStatus as ExampleSentenceStatus;
		await prisma.exampleSentence.update({
			where: { id: params.id },
			data: {
				status,
				lemmaProofreadAt: status === 'NEEDS_PROOFREAD' ? null : new Date()
			}
		});

		return { setSentenceStatusSuccess: true, status };
	},
	deleteSentence: async ({ params, locals }) => {
		requireEditor(locals);

		const existing = await prisma.exampleSentence.findUnique({
			where: { id: params.id },
			select: {
				id: true,
				storySentence: { select: { id: true } },
				imageUrl: true,
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

		if (existing.storySentence) {
			return fail(409, {
				error: 'This sentence comes from a story lesson. Edit or delete it from the story lesson.'
			});
		}

		await prisma.exampleSentence.delete({ where: { id: params.id } });
		if (existing.imageUrl) await deleteUploadedImage(existing.imageUrl);

		redirect(303, '/corpus');
	}
};
