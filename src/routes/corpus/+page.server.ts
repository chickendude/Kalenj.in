import { fail, redirect } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/prisma';
import { findMatchingExampleSentence } from '$lib/server/example-sentence-dedupe';
import { tokenizeSentence } from '$lib/server/tokenize';
import { requireEditor } from '$lib/server/guards';
import { backfillMissingStoryCorpusEntries } from '$lib/server/story-sync';
import type { Actions, PageServerLoad } from './$types';

type SearchLanguage = 'both' | 'kalenjin' | 'english';

function readText(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

function parseLanguage(value: string | null): SearchLanguage {
	if (value === 'both' || value === 'kalenjin' || value === 'english') {
		return value;
	}
	return 'kalenjin';
}

export const load: PageServerLoad = async ({ url }) => {
	await backfillMissingStoryCorpusEntries();

	const query = (url.searchParams.get('q') ?? '').trim();
	const language = parseLanguage(url.searchParams.get('lang'));

	let where: Prisma.ExampleSentenceWhereInput | undefined;
	if (query) {
		if (language === 'kalenjin') {
			where = { kalenjin: { contains: query, mode: 'insensitive' } };
		} else if (language === 'english') {
			where = { english: { contains: query, mode: 'insensitive' } };
		} else {
			where = {
				OR: [
					{ kalenjin: { contains: query, mode: 'insensitive' } },
					{ english: { contains: query, mode: 'insensitive' } }
				]
			};
		}
	}

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
		prisma.exampleSentence.count()
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
	}
};
