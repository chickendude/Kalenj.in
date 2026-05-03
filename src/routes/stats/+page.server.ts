import {
	loadStats,
	METRIC_IDS,
	pickBucketForRange,
	rangeBounds,
	RANGE_IDS,
	type MetricId,
	type RangeId
} from '$lib/server/stats';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 30;

function parseRange(raw: string | null): RangeId {
	return RANGE_IDS.find((r) => r === raw) ?? 'past30Days';
}

function parsePage(raw: string | null): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1) return 1;
	return Math.floor(n);
}

export const load: PageServerLoad = async ({ url }) => {
	const range = parseRange(url.searchParams.get('range'));
	const page = parsePage(url.searchParams.get('page'));

	const { from, to } = await rangeBounds(range);
	const bucket = pickBucketForRange(from, to);

	// `f=1` is a hidden marker the form always submits — distinguishes "user actively
	// chose this metric subset (possibly empty)" from "URL didn't mention metrics, default to all".
	const filtersTouched = url.searchParams.has('f');
	const requestedMetrics = url.searchParams.getAll('metrics');
	const selectedMetrics: MetricId[] = filtersTouched
		? METRIC_IDS.filter((id) => requestedMetrics.includes(id))
		: [...METRIC_IDS];

	const stats = await loadStats(bucket, from, to);

	return {
		stats,
		range,
		page,
		pageSize: PAGE_SIZE,
		selectedMetrics,
		availableMetrics: [...METRIC_IDS]
	};
};
