import { fail, redirect } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import {
	buildBulkSentenceReviewRows,
	normalizeBulkSentenceForReview,
	type BulkSentenceReviewRow
} from '$lib/bulk-sentences';
import { prisma } from '$lib/server/prisma';
import {
	buildCorpusSentenceSearchWhere,
	findKalenjinCorpusSentenceIds,
	parseCorpusSearchLanguage
} from '$lib/server/corpus-search';
import { findMatchingExampleSentence } from '$lib/server/example-sentence-dedupe';
import { tokenizeSentence, type TokenizedWord } from '$lib/server/tokenize';
import { requireAdmin, requireEditor } from '$lib/server/guards';
import { backfillMissingStoryCorpusEntries } from '$lib/server/story-sync';
import type { Actions, PageServerLoad } from './$types';

function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

function parseReviewRows(formData: FormData): BulkSentenceReviewRow[] {
	const rawRows = readText(formData, 'reviewRows');
	if (!rawRows) {
		throw new Error('Review at least one sentence before saving.');
	}

	const rows = JSON.parse(rawRows);
	if (!Array.isArray(rows) || rows.length === 0) {
		throw new Error('Review at least one sentence before saving.');
	}

	return rows.map((row, index) => {
		const lineNumber = Number(row?.lineNumber ?? index + 1);
		const kalenjin = String(row?.kalenjin ?? '').trim();
		const english = String(row?.english ?? '').trim();

		if (!kalenjin || !english) {
			throw new Error(`Row ${index + 1}: Kalenjin and English are both required.`);
		}

		return normalizeBulkSentenceForReview({
			lineNumber: Number.isFinite(lineNumber) ? lineNumber : index + 1,
			kalenjin,
			english
		});
	});
}

export const load: PageServerLoad = async ({ url }) => {
	await backfillMissingStoryCorpusEntries();

	const query = (url.searchParams.get('q') ?? '').trim();
	const language = parseCorpusSearchLanguage(url.searchParams.get('lang'));
	const kalenjinSentenceIds =
		query && language !== 'english' ? await findKalenjinCorpusSentenceIds(prisma, query) : [];
	const searchWhere = buildCorpusSentenceSearchWhere(query, language, kalenjinSentenceIds);
	const nonEmpty: Prisma.ExampleSentenceWhereInput = { NOT: { kalenjin: '' } };
	const where: Prisma.ExampleSentenceWhereInput = searchWhere
		? { AND: [searchWhere, nonEmpty] }
		: nonEmpty;

	const [sentences, totalCount] = await Promise.all([
		prisma.exampleSentence.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			include: {
				tokens: {
					orderBy: { tokenOrder: 'asc' },
					include: {
						word: true,
						segments: {
							orderBy: { segmentOrder: 'asc' },
							include: { word: true }
						}
					}
				},
				_count: { select: { tokens: true } }
			},
			take: 100
		}),
		prisma.exampleSentence.count({ where })
	]);

	return {
		query,
		language,
		sentences,
		totalCount
	};
};

export const actions: Actions = {
	createSentence: async ({ request, locals }) => {
		requireEditor(locals);
		const formData = await request.formData();
		const kalenjin = readText(formData, 'kalenjin');
		const english = readText(formData, 'english');
		const notes = readText(formData, 'notes');

		if (!kalenjin || !english) {
			return fail(400, {
				error: 'Kalenjin sentence and English translation are required.',
				values: { kalenjin, english, notes }
			});
		}

		const existing = await findMatchingExampleSentence(prisma, kalenjin, english);
		if (existing) {
			redirect(303, `/corpus/${existing.id}`);
		}

		const tokenData = tokenizeSentence(kalenjin);
		if (tokenData.length === 0) {
			return fail(400, {
				error: 'Could not extract tokens from this sentence.',
				values: { kalenjin, english, notes }
			});
		}

		const sentence = await prisma.exampleSentence.create({
			data: {
				kalenjin,
				english,
				notes: notes || null,
				tokens: {
					createMany: {
						data: tokenData
					}
				}
			}
		});

		redirect(303, `/corpus/${sentence.id}`);
	},
	previewBulkSentences: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const bulkText = readText(formData, 'bulkText');

		try {
			return {
				bulkReviewRows: buildBulkSentenceReviewRows(bulkText),
				bulkValues: { bulkText }
			};
		} catch (error) {
			return fail(400, {
				bulkError: error instanceof Error ? error.message : 'Could not read the pasted sentences.',
				bulkValues: { bulkText }
			});
		}
	},
	saveBulkSentences: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		let reviewRows: BulkSentenceReviewRow[];
		try {
			reviewRows = parseReviewRows(formData);
		} catch (error) {
			return fail(400, {
				bulkSaveError:
					error instanceof Error ? error.message : 'Could not read the reviewed sentences.',
				bulkReviewRows: []
			});
		}
		let skippedCount = 0;
		const seen = new Set<string>();
		const sentencesToCreate: Array<BulkSentenceReviewRow & { tokenData: TokenizedWord[] }> = [];

		for (const sentence of reviewRows) {
			const dedupeKey = `${sentence.kalenjin.trim().toLocaleLowerCase()}\u0000${sentence.english
				.trim()
				.toLocaleLowerCase()}`;

			if (seen.has(dedupeKey)) {
				skippedCount += 1;
				continue;
			}
			seen.add(dedupeKey);

			const tokenData = tokenizeSentence(sentence.kalenjin);
			if (tokenData.length === 0) {
				return fail(400, {
					bulkError: `Line ${sentence.lineNumber}: could not extract tokens from the Kalenjin sentence.`,
					bulkReviewRows: reviewRows
				});
			}

			const existing = await findMatchingExampleSentence(prisma, sentence.kalenjin, sentence.english);
			if (existing) {
				skippedCount += 1;
				continue;
			}

			sentencesToCreate.push({ ...sentence, tokenData });
		}

		await prisma.$transaction(async (tx) => {
			for (const sentence of sentencesToCreate) {
				await tx.exampleSentence.create({
					data: {
						kalenjin: sentence.kalenjin,
						english: sentence.english,
						tokens: {
							createMany: {
								data: sentence.tokenData
							}
						}
					}
				});
			}
		});

		return {
			bulkSuccess: true,
			createdCount: sentencesToCreate.length,
			skippedCount
		};
	}
};
