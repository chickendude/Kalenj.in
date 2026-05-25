import { fail } from '@sveltejs/kit';
import type { ExampleSentenceStatus, Prisma } from '@prisma/client';

const SENTENCE_STATUSES = ['NEEDS_PROOFREAD', 'IN_CORPUS', 'STORY_ONLY'] as const satisfies readonly ExampleSentenceStatus[];
const SENTENCE_STATUS_SET: ReadonlySet<string> = new Set(SENTENCE_STATUSES);
import { buildWordSelect } from '$lib/server/lemma-words';
import {
	autoLemmatizeMissingExampleSentenceWords,
	type AutoLemmatizeExistingSummary
} from '$lib/server/auto-lemma';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import {
	buildSentenceStoryLinks,
	sentenceStoryLinkSelect
} from '$lib/server/sentence-story-links';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 25;
const LEMMA_STATUS_FILTERS = ['all', 'missing', 'complete'] as const;
type LemmaStatusFilter = (typeof LEMMA_STATUS_FILTERS)[number];

type LemmaStats = {
	linkedUnits: number;
	totalUnits: number;
	missingUnits: number;
};

type QueueSentenceForStats = {
	id: string;
	updatedAt: Date;
	tokens: Array<{
		normalizedForm: string;
		wordId: string | null;
		segments: Array<{
			normalizedForm: string;
			wordId: string | null;
		}>;
	}>;
};

function autoLemmaMessage(summary: AutoLemmatizeExistingSummary): string {
	if (summary.linkedWords === 0 && summary.translatedWords === 0) {
		return `No automatic lemma matches found in ${summary.scannedSentences} scanned sentence${
			summary.scannedSentences === 1 ? '' : 's'
		}.`;
	}

	const parts = [];
	if (summary.linkedWords > 0) {
		parts.push(`linked ${summary.linkedWords} word${summary.linkedWords === 1 ? '' : 's'}`);
	}
	if (summary.translatedWords > 0) {
		parts.push(
			`filled ${summary.translatedWords} context translation${
				summary.translatedWords === 1 ? '' : 's'
			}`
		);
	}
	const summaryText = parts.join(' and ');
	const capitalizedSummary = summaryText.charAt(0).toUpperCase() + summaryText.slice(1);

	return `${capitalizedSummary} in ${summary.updatedSentences} sentence${
		summary.updatedSentences === 1 ? '' : 's'
	}; queued ${summary.updatedSentences === 1 ? 'it' : 'them'} for proofread.`;
}

function parsePage(value: string | null): number {
	const page = Number(value ?? '1');
	return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseLemmaStatus(value: string | null): LemmaStatusFilter {
	return LEMMA_STATUS_FILTERS.includes(value as LemmaStatusFilter)
		? (value as LemmaStatusFilter)
		: 'all';
}

function lemmaStatsForSentence(
	sentence: QueueSentenceForStats,
	ignoredForms: Set<string>
): LemmaStats {
	const units = sentence.tokens.flatMap((token) =>
		token.segments.length > 0
			? token.segments.map((segment) => ({
					normalizedForm: segment.normalizedForm,
					wordId: segment.wordId
				}))
			: [{ normalizedForm: token.normalizedForm, wordId: token.wordId }]
	);
	const totalUnits = units.length;
	const linkedUnits = units.filter(
		(unit) => Boolean(unit.wordId) || ignoredForms.has(unit.normalizedForm)
	).length;

	return {
		linkedUnits,
		totalUnits,
		missingUnits: totalUnits - linkedUnits
	};
}

function completionRatio(stats: LemmaStats): number {
	return stats.totalUnits === 0 ? 0 : stats.linkedUnits / stats.totalUnits;
}

function buildPageHref(page: number, lemmaStatus: LemmaStatusFilter): string {
	const params = new URLSearchParams();
	if (page > 1) params.set('page', String(page));
	if (lemmaStatus !== 'all') params.set('lemmaStatus', lemmaStatus);
	const query = params.toString();
	return query ? `/admin/proofread?${query}` : '/admin/proofread';
}

const pageSentenceIncludeBase = {
	tokens: {
		orderBy: { tokenOrder: 'asc' },
		include: {
			word: { select: buildWordSelect() },
			segments: {
				orderBy: { segmentOrder: 'asc' },
				include: {
					word: { select: buildWordSelect() }
				}
			}
		}
	}
} satisfies Prisma.ExampleSentenceInclude;

const pageSentenceIncludeWithStory = {
	...pageSentenceIncludeBase,
	storySentence: { select: sentenceStoryLinkSelect }
} satisfies Prisma.ExampleSentenceInclude;

type ProofreadSentenceRow = Prisma.ExampleSentenceGetPayload<{
	include: typeof pageSentenceIncludeWithStory;
}>;

function serializeProofreadSentence(
	sentence: ProofreadSentenceRow,
	lemmaStats: LemmaStats,
	isAdmin: boolean
) {
	const { storySentence: _storySentence, ...rest } = sentence;
	return {
		...rest,
		lemmaStats,
		storyLinks: isAdmin ? buildSentenceStoryLinks(sentence) : []
	};
}

export const load: PageServerLoad = async ({ locals, url }) => {
	requireEditor(locals);
	const isAdmin = locals.user?.role === 'ADMIN';
	const lemmaStatus = parseLemmaStatus(url.searchParams.get('lemmaStatus'));
	const requestedPage = parsePage(url.searchParams.get('page'));

	const [queueSentences, words, ignoredForms] = await Promise.all([
		prisma.exampleSentence.findMany({
			where: { status: 'NEEDS_PROOFREAD' },
			select: {
				id: true,
				updatedAt: true,
				tokens: {
					orderBy: { tokenOrder: 'asc' },
					select: {
						normalizedForm: true,
						wordId: true,
						segments: {
							orderBy: { segmentOrder: 'asc' },
							select: { normalizedForm: true, wordId: true }
						}
					}
				}
			}
		}),
		prisma.word.findMany({
			orderBy: [{ kalenjin: 'asc' }, { translations: 'asc' }],
			take: 500
		}),
		prisma.ignoredWordForm.findMany({ select: { normalizedForm: true } })
	]);
	const ignoredSet = new Set(ignoredForms.map((entry) => entry.normalizedForm));
	const queuedWithStats = queueSentences.map((sentence) => ({
		id: sentence.id,
		updatedAt: sentence.updatedAt,
		lemmaStats: lemmaStatsForSentence(sentence, ignoredSet)
	}));
	const filteredQueue = queuedWithStats
		.filter((sentence) => {
			if (lemmaStatus === 'missing') return sentence.lemmaStats.missingUnits > 0;
			if (lemmaStatus === 'complete') return sentence.lemmaStats.missingUnits === 0;
			return true;
		})
		.sort((a, b) => {
			const ratioDiff = completionRatio(b.lemmaStats) - completionRatio(a.lemmaStats);
			if (ratioDiff !== 0) return ratioDiff;
			const totalDiff = a.lemmaStats.totalUnits - b.lemmaStats.totalUnits;
			if (totalDiff !== 0) return totalDiff;
			return b.updatedAt.getTime() - a.updatedAt.getTime();
		});
	const total = filteredQueue.length;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const page = Math.min(requestedPage, totalPages);
	const pageStart = (page - 1) * PAGE_SIZE;
	const visibleQueue = filteredQueue.slice(pageStart, pageStart + PAGE_SIZE);
	const visibleIds = visibleQueue.map((sentence) => sentence.id);
	const pageSentences =
		visibleIds.length > 0
			? await prisma.exampleSentence.findMany({
					where: { id: { in: visibleIds } },
					include: isAdmin ? pageSentenceIncludeWithStory : pageSentenceIncludeBase
				})
			: [];
	const statsById = new Map(visibleQueue.map((sentence) => [sentence.id, sentence.lemmaStats]));
	const sentenceById = new Map(
		pageSentences.map((sentence) => [sentence.id, sentence as ProofreadSentenceRow])
	);
	const sentences = visibleIds.flatMap((id) => {
		const sentence = sentenceById.get(id);
		const lemmaStats = statsById.get(id);
		return sentence && lemmaStats
			? [serializeProofreadSentence(sentence, lemmaStats, isAdmin)]
			: [];
	});

	return {
		page,
		pageSize: PAGE_SIZE,
		totalPages,
		lemmaStatus,
		statusCounts: {
			all: queuedWithStats.length,
			missing: queuedWithStats.filter((sentence) => sentence.lemmaStats.missingUnits > 0).length,
			complete: queuedWithStats.filter((sentence) => sentence.lemmaStats.missingUnits === 0).length
		},
		pageHref: {
			prev: page > 1 ? buildPageHref(page - 1, lemmaStatus) : null,
			next: page < totalPages ? buildPageHref(page + 1, lemmaStatus) : null
		},
		sentences,
		total,
		words,
		ignoredNormalizedForms: ignoredForms.map((entry) => entry.normalizedForm)
	};
};

export const actions: Actions = {
	autoLemmatize: async ({ locals }) => {
		requireEditor(locals);
		const summary = await autoLemmatizeMissingExampleSentenceWords(prisma);
		return {
			autoLemmaSuccess: autoLemmaMessage(summary)
		};
	},

	setSentenceStatus: async ({ request, locals }) => {
		requireEditor(locals);
		const data = await request.formData();
		const sentenceId = String(data.get('sentenceId') ?? '').trim();
		const rawStatus = String(data.get('status') ?? '').trim();

		if (!sentenceId) {
			return fail(400, { proofreadError: 'Sentence is required.' });
		}

		if (!SENTENCE_STATUS_SET.has(rawStatus)) {
			return fail(400, { proofreadError: `Unknown sentence status: "${rawStatus}".` });
		}

		const status = rawStatus as ExampleSentenceStatus;
		await prisma.exampleSentence.update({
			where: { id: sentenceId },
			data: {
				status,
				lemmaProofreadAt: status === 'NEEDS_PROOFREAD' ? null : new Date()
			}
		});

		const STATUS_MESSAGES: Record<ExampleSentenceStatus, string> = {
			NEEDS_PROOFREAD: 'Sentence returned to the proofread queue.',
			IN_CORPUS: 'Sentence marked proofread.',
			STORY_ONLY: 'Sentence marked story-only and removed from the corpus.'
		};

		return { proofreadSuccess: STATUS_MESSAGES[status] };
	}
};
