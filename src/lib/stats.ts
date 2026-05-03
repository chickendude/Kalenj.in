// Client-safe stats helpers: pure types, constants, and presentation logic.
// Server-only stats code (DB queries) lives in `$lib/server/stats`.

export type Bucket = 'day' | 'week' | 'month' | 'year';

export type RangeId =
	| 'past7Days'
	| 'past30Days'
	| 'pastYear'
	| 'thisWeek'
	| 'thisMonth'
	| 'thisYear'
	| 'allTime';

export const RANGE_IDS: RangeId[] = [
	'past7Days',
	'past30Days',
	'pastYear',
	'thisWeek',
	'thisMonth',
	'thisYear',
	'allTime'
];

export const METRIC_IDS = [
	'wordsCreated',
	'sentencesCreated',
	'cumulativeWords',
	'cumulativeSentences'
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

export type SeriesPoint = { bucket: string; count: number };

// Each cumulative metric is derived from a creation metric. This mapping is the
// "source of change" used to detect whether a bucket had real activity.
export const CUMULATIVE_SOURCE: Partial<Record<MetricId, MetricId>> = {
	cumulativeWords: 'wordsCreated',
	cumulativeSentences: 'sentencesCreated'
};

export function sourceChangeMetric(id: MetricId): MetricId {
	return CUMULATIVE_SOURCE[id] ?? id;
}

export function getEffectiveChangeMetrics(visible: MetricId[]): MetricId[] {
	return Array.from(new Set(visible.map(sourceChangeMetric)));
}

// Returns indices of buckets where at least one effective change metric > 0.
export function filterEmptyBucketIndices(
	bucketCount: number,
	series: Record<MetricId, SeriesPoint[]>,
	effectiveMetrics: MetricId[]
): number[] {
	const indices: number[] = [];
	for (let i = 0; i < bucketCount; i++) {
		if (effectiveMetrics.some((id) => series[id][i].count > 0)) indices.push(i);
	}
	return indices;
}

// Returns the value to render for a metric at a bucket, or `null` to render blank.
// Cumulative metrics are blank on rows where the underlying creation didn't change.
export function cumulativeCellValue(
	id: MetricId,
	bucketIndex: number,
	series: Record<MetricId, SeriesPoint[]>
): number | null {
	const source = CUMULATIVE_SOURCE[id];
	if (source && series[source][bucketIndex].count === 0) return null;
	return series[id][bucketIndex].count;
}
