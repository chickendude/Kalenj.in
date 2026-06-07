import {
	METRIC_IDS,
	loadStats,
	pickBucketForRange,
	rangeBounds,
	type MetricId
} from '$lib/server/stats';
import {
	buildStatsFilterParams,
	parseStatsFilterPreference,
	parseStatsMetrics,
	parseStatsRange,
	statsUrlHasFilterParams
} from '$lib/stats-preferences';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 30;

function parsePage(raw: string | null): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1) return 1;
	return Math.floor(n);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const savedParams = parseStatsFilterPreference(locals?.user?.statsFilterPreference);
	const sourceParams =
		statsUrlHasFilterParams(url.searchParams) || !savedParams ? url.searchParams : savedParams;
	const range = parseStatsRange(sourceParams.get('range'));
	const page = parsePage(url.searchParams.get('page'));

	const { from, to } = await rangeBounds(range);
	const bucket = pickBucketForRange(from, to);

	// `f=1` is a hidden marker the form always submits — distinguishes "user actively
	// chose this metric subset (possibly empty)" from "URL didn't mention metrics, default to all".
	const filtersTouched = sourceParams.has('f');
	const selectedMetrics: MetricId[] = filtersTouched
		? parseStatsMetrics(sourceParams.getAll('metrics'))
		: [...METRIC_IDS];

	const stats = await loadStats(bucket, from, to);
	const activeFilterPreference = buildStatsFilterParams(range, selectedMetrics).toString();

	return {
		stats,
		range,
		page,
		pageSize: PAGE_SIZE,
		selectedMetrics,
		activeFilterPreference,
		availableMetrics: [...METRIC_IDS]
	};
};
