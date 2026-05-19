import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import { deleteUploadedImage } from '$lib/server/uploads';
import {
	planSentenceMerge,
	SentenceMergeError,
	type MergeSentence
} from '$lib/server/example-sentence-merge';
import { isDuplicateGroupVisible } from '$lib/server/duplicate-sentence-groups';
import type { Actions, PageServerLoad } from './$types';

function normalizeKey(value: string): string {
	return value.trim().toLowerCase();
}

export const load: PageServerLoad = async ({ locals }) => {
	requireEditor(locals);

	const duplicateKeys = await prisma.$queryRaw<{ key: string; count: bigint }[]>`
		SELECT LOWER(TRIM(kalenjin)) AS key, COUNT(*) AS count
		FROM "ExampleSentence"
		GROUP BY LOWER(TRIM(kalenjin))
		HAVING COUNT(*) > 1
		ORDER BY COUNT(*) DESC, LOWER(TRIM(kalenjin)) ASC
	`;

	if (duplicateKeys.length === 0) {
		return { groups: [] };
	}

	const keys = duplicateKeys.map((row) => row.key);

	const sentences = await prisma.exampleSentence.findMany({
		where: {
			// Postgres collation: we need to re-filter in JS since Prisma can't match the
			// LOWER(TRIM(...)) expression directly. Pull in any sentence whose kalenjin
			// could plausibly match, then normalize and group below.
			OR: keys.map((key) => ({
				kalenjin: { equals: key, mode: 'insensitive' as const }
			}))
		},
		orderBy: { createdAt: 'asc' },
		select: {
			id: true,
			kalenjin: true,
			english: true,
			notes: true,
			isUnique: true,
			audioUrl: true,
			imageUrl: true,
			createdAt: true,
			storySentence: {
				select: {
					id: true,
					sentenceOrder: true,
					story: {
						select: {
							id: true,
							title: true,
							lesson: { select: { id: true, title: true } }
						}
					}
				}
			},
			lessonWords: {
				select: {
					id: true,
					kalenjin: true,
					lessonSection: {
						select: {
							lesson: { select: { id: true, title: true } }
						}
					}
				}
			},
			_count: { select: { tokens: true } },
			tokens: {
				orderBy: { tokenOrder: 'asc' },
				select: {
					id: true,
					surfaceForm: true,
					inContextTranslation: true,
					word: { select: { kalenjin: true } },
					segments: {
						orderBy: { segmentOrder: 'asc' },
						select: { id: true, surfaceForm: true, word: { select: { kalenjin: true } } }
					}
				}
			}
		}
	});

	const groupMap = new Map<string, typeof sentences>();
	for (const sentence of sentences) {
		const key = normalizeKey(sentence.kalenjin);
		if (!keys.includes(key)) continue;
		const bucket = groupMap.get(key);
		if (bucket) {
			bucket.push(sentence);
		} else {
			groupMap.set(key, [sentence]);
		}
	}

	const groups = Array.from(groupMap.entries())
		.filter(([, items]) => isDuplicateGroupVisible(items))
		.map(([key, items]) => ({
			key,
			kalenjin: items[0].kalenjin,
			sentences: items
		}))
		.sort((a, b) => b.sentences.length - a.sentences.length);

	return { groups };
};

export const actions: Actions = {
	deleteSentences: async ({ request, locals }) => {
		requireEditor(locals);

		const formData = await request.formData();
		const ids = formData
			.getAll('ids')
			.map((value) => String(value).trim())
			.filter((id) => id.length > 0);

		if (ids.length === 0) {
			return fail(400, { error: 'No sentences selected for deletion.' });
		}

		const targets = await prisma.exampleSentence.findMany({
			where: { id: { in: ids } },
			select: { id: true, storySentenceId: true }
		});

		// Story-linked sentences are owned by the story and would be recreated
		// by the corpus backfill, so skip them. Lesson references can be nulled
		// out since LessonWord.sentenceId is optional.
		const deletable = targets.filter((t) => !t.storySentenceId).map((t) => t.id);
		const skippedCount = targets.length - deletable.length;

		if (deletable.length === 0) {
			return fail(409, {
				error:
					skippedCount > 0
						? `Could not delete ${skippedCount} sentence${skippedCount === 1 ? '' : 's'}: sourced from a story.`
						: 'No sentences were deleted.'
			});
		}

		await prisma.$transaction(async (tx) => {
			await tx.lessonWord.updateMany({
				where: { sentenceId: { in: deletable } },
				data: { sentenceId: null }
			});
			await tx.exampleSentence.deleteMany({ where: { id: { in: deletable } } });
		});

		return {
			deletedCount: deletable.length,
			skippedCount,
			requestedCount: ids.length
		};
	},

	mergeSentences: async ({ request, locals }) => {
		requireEditor(locals);

		const formData = await request.formData();
		const key = normalizeKey(String(formData.get('key') ?? ''));
		const targetId = String(formData.get('targetId') ?? '').trim();
		const english = String(formData.get('english') ?? '');
		const notesRaw = String(formData.get('notes') ?? '');
		const audioSourceId = String(formData.get('audioSourceId') ?? '').trim() || null;
		const imageSourceId = String(formData.get('imageSourceId') ?? '').trim() || null;
		const ids = Array.from(
			new Set(
				formData
					.getAll('ids')
					.map((v) => String(v).trim())
					.filter((id) => id.length > 0)
			)
		);

		if (!targetId || ids.length < 2) {
			return fail(400, { error: 'Select a group with at least two sentences to merge.' });
		}
		if (!ids.includes(targetId)) {
			return fail(400, { error: 'The kept sentence must be one of the group.' });
		}

		const rows = await prisma.exampleSentence.findMany({
			where: { id: { in: ids } },
			select: {
				id: true,
				kalenjin: true,
				notes: true,
				audioUrl: true,
				audioRecordedById: true,
				audioRecordedAt: true,
				imageUrl: true,
				storySentenceId: true,
				words: { select: { wordId: true } },
				lessonWords: { select: { id: true } }
			}
		});

		if (rows.length !== ids.length) {
			return fail(409, { error: 'Some selected sentences no longer exist. Reload and retry.' });
		}
		if (rows.some((r) => normalizeKey(r.kalenjin) !== key)) {
			return fail(400, { error: 'Selected sentences are not all in the same duplicate group.' });
		}

		const mergeInput: MergeSentence[] = rows.map((r) => ({
			id: r.id,
			normalizedKey: normalizeKey(r.kalenjin),
			storySourced: r.storySentenceId != null,
			hasLessonWord: r.lessonWords.length > 0,
			english: '',
			notes: r.notes,
			audioUrl: r.audioUrl,
			imageUrl: r.imageUrl
		}));

		let plan;
		try {
			plan = planSentenceMerge(mergeInput, {
				targetId,
				english,
				notes: notesRaw,
				audioSourceId,
				imageSourceId
			});
		} catch (err) {
			if (err instanceof SentenceMergeError) {
				return fail(400, { error: err.message });
			}
			throw err;
		}

		const byId = new Map(rows.map((r) => [r.id, r]));
		const target = byId.get(plan.targetId)!;

		const audioSource = plan.targetUpdate.audioSourceId
			? byId.get(plan.targetUpdate.audioSourceId)!
			: null;
		const imageSource = plan.targetUpdate.imageSourceId
			? byId.get(plan.targetUpdate.imageSourceId)!
			: null;
		const newImageUrl = imageSource ? imageSource.imageUrl : null;
		const replacedImageUrl =
			target.imageUrl && target.imageUrl !== newImageUrl ? target.imageUrl : null;

		const wordIds = Array.from(
			new Set(
				rows
					.filter((r) => plan.wordLinkSourceIds.includes(r.id))
					.flatMap((r) => r.words.map((w) => w.wordId))
			)
		);

		await prisma.$transaction(async (tx) => {
			await tx.exampleSentence.update({
				where: { id: plan.targetId },
				data: {
					english: plan.targetUpdate.english,
					notes: plan.targetUpdate.notes,
					audioUrl: audioSource ? audioSource.audioUrl : null,
					audioRecordedById: audioSource ? audioSource.audioRecordedById : null,
					audioRecordedAt: audioSource ? audioSource.audioRecordedAt : null,
					imageUrl: newImageUrl
				}
			});

			if (plan.lessonRepointId) {
				await tx.lessonWord.updateMany({
					where: { sentenceId: plan.lessonRepointId },
					data: { sentenceId: plan.targetId }
				});
			}

			if (wordIds.length > 0) {
				await tx.wordSentence.createMany({
					data: wordIds.map((wordId) => ({
						wordId,
						exampleSentenceId: plan.targetId
					})),
					skipDuplicates: true
				});
			}

			if (plan.deleteIds.length > 0) {
				await tx.exampleSentence.deleteMany({ where: { id: { in: plan.deleteIds } } });
			}
		});

		// The replaced target image is only safe to delete once nothing else
		// references it (a folded-in copy could have pointed at the same file).
		if (replacedImageUrl) {
			const stillUsed = await prisma.exampleSentence.count({
				where: { imageUrl: replacedImageUrl }
			});
			if (stillUsed === 0) await deleteUploadedImage(replacedImageUrl);
		}

		const storySkips = plan.skipped.filter((s) => s.reason === 'story').length;
		const lessonSkips = plan.skipped.filter((s) => s.reason === 'lesson-conflict').length;

		return {
			mergedCount: plan.deleteIds.length,
			keptId: plan.targetId,
			storySkips,
			lessonSkips
		};
	},

	toggleUnique: async ({ request, locals }) => {
		requireEditor(locals);

		const formData = await request.formData();
		const sentenceId = String(formData.get('sentenceId') ?? '').trim();
		const isUnique = String(formData.get('isUnique') ?? '') === '1';

		if (!sentenceId) {
			return fail(400, { error: 'No sentence specified.' });
		}

		const updated = await prisma.exampleSentence.updateMany({
			where: { id: sentenceId },
			data: { isUnique }
		});

		if (updated.count === 0) {
			return fail(404, { error: 'Sentence not found.' });
		}

		return { uniqueToggled: true, sentenceId, isUnique };
	}
};
