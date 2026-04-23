import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
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
			_count: { select: { tokens: true } }
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
		.filter(([, items]) => items.length > 1)
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
	}
};
