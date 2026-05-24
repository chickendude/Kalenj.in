import { prisma } from '$lib/server/prisma';
import { parsePositiveInteger } from '$lib/server/course-form';
import type { CefrLevel } from '@prisma/client';

const CEFR_PAGE_SIZE = 25;
const CEFR_RANDOM_SAMPLE_SIZE = 10;
const CEFR_SORT_OPTIONS = ['alpha-asc', 'alpha-desc'] as const;
export type CefrSortOption = (typeof CEFR_SORT_OPTIONS)[number];

const CEFR_COVERAGE_FILTERS = ['all', 'covered', 'uncovered'] as const;
export type CefrCoverageFilter = (typeof CEFR_COVERAGE_FILTERS)[number];

export function parseCefrSortOption(value: string | null): CefrSortOption {
	return value === 'alpha-desc' ? 'alpha-desc' : 'alpha-asc';
}

function parseCefrCoverageFilter(value: string | null): CefrCoverageFilter {
	if (value === 'all') return 'all';
	if (value === 'yes' || value === 'covered') return 'covered';
	return 'uncovered';
}

function parseCefrPosFilters(value: string | null): string[] {
	if (!value) return [];

	return [
		...new Set(
			value
				.split(',')
				.map((token) => token.trim().toLowerCase())
				.filter(Boolean)
		)
	];
}

function extractPosTokens(english: string): string[] {
	const match = english.match(/\(([^)]+)\)/);

	if (!match) {
		return [];
	}

	return match[1]
		.split('/')
		.map((token) => token.trim().toLowerCase())
		.filter(Boolean);
}

export type CefrBrowseData = {
	query: string;
	sort: CefrSortOption;
	coverageFilter: CefrCoverageFilter;
	posFilters: string[];
	posOptions: { token: string; count: number }[];
	targets: Awaited<ReturnType<typeof fetchTargets>>;
	page: number;
	pageSize: number;
	filteredCount: number;
	totalPages: number;
	totalCount: number;
	coveredCount: number;
	isRandom: boolean;
};

async function fetchTargets(level: CefrLevel, sort: CefrSortOption) {
	return prisma.cefrEnglishTarget.findMany({
		where: { level },
		include: {
			coveredByLessonWord: {
				include: {
					lessonSection: {
						include: {
							lesson: true
						}
					}
				}
			}
		},
		orderBy: [{ english: sort === 'alpha-desc' ? 'desc' : 'asc' }]
	});
}

export async function loadCefrBrowse(
	searchParams: URLSearchParams,
	level: CefrLevel
): Promise<CefrBrowseData> {
	const query = (searchParams.get('q') ?? '').trim();
	const sort = parseCefrSortOption(searchParams.get('sort'));
	const requestedPage = parsePositiveInteger(searchParams.get('page'));
	const coverageFilter = parseCefrCoverageFilter(searchParams.get('covered'));
	const posFilters = parseCefrPosFilters(searchParams.get('pos'));

	const levelTargets = await fetchTargets(level, sort);

	const targetsWithPos = levelTargets.map((target) => ({
		target,
		posTokens: extractPosTokens(target.english)
	}));

	const totalCount = levelTargets.length;
	const coveredCount = levelTargets.filter((t) => t.coveredByLessonWord).length;

	const posFilterSet = new Set(posFilters);
	const queryLower = query.toLowerCase();

	function matchesCoverageAndQuery({
		target
	}: {
		target: (typeof targetsWithPos)[number]['target'];
	}): boolean {
		if (queryLower && !target.english.toLowerCase().includes(queryLower)) {
			return false;
		}
		if (coverageFilter === 'covered' && !target.coveredByLessonWord) {
			return false;
		}
		if (coverageFilter === 'uncovered' && target.coveredByLessonWord) {
			return false;
		}
		return true;
	}

	// Count POS tokens within the current coverage + query slice so the chips
	// reflect what is actually selectable in the visible list. POS filter is
	// intentionally NOT applied here so each chip still shows its own count.
	const posTokenCounts = new Map<string, number>();
	for (const entry of targetsWithPos) {
		if (!matchesCoverageAndQuery(entry)) continue;
		for (const token of entry.posTokens) {
			posTokenCounts.set(token, (posTokenCounts.get(token) ?? 0) + 1);
		}
	}

	const filteredTargets = targetsWithPos
		.filter(matchesCoverageAndQuery)
		.filter(({ posTokens }) => {
			if (posFilterSet.size === 0) {
				return true;
			}
			if (posFilterSet.has('(none)') && posTokens.length === 0) {
				return true;
			}
			return posTokens.some((token) => posFilterSet.has(token));
		})
		.map(({ target }) => target);

	const filteredCount = filteredTargets.length;
	const isRandom = Boolean(searchParams.get('random'));

	let targets: typeof filteredTargets;
	let page: number;
	let totalPages: number;

	if (isRandom) {
		targets = sampleRandom(filteredTargets, CEFR_RANDOM_SAMPLE_SIZE);
		page = 1;
		totalPages = 1;
	} else {
		totalPages = Math.max(1, Math.ceil(filteredCount / CEFR_PAGE_SIZE));
		page = Math.min(requestedPage, totalPages);
		targets = filteredTargets.slice((page - 1) * CEFR_PAGE_SIZE, page * CEFR_PAGE_SIZE);
	}

	const posOptions = [...posTokenCounts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([token, count]) => ({ token, count }));

	return {
		query,
		sort,
		coverageFilter,
		posFilters,
		posOptions,
		targets,
		page,
		pageSize: CEFR_PAGE_SIZE,
		filteredCount,
		totalPages,
		totalCount,
		coveredCount,
		isRandom
	};
}

function sampleRandom<T>(items: T[], size: number): T[] {
	if (items.length <= size) {
		return [...items].sort(() => Math.random() - 0.5);
	}
	const indices = new Set<number>();
	while (indices.size < size) {
		indices.add(Math.floor(Math.random() * items.length));
	}
	return [...indices].map((i) => items[i]);
}
