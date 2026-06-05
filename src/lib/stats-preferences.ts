import { METRIC_IDS, RANGE_IDS, type MetricId, type RangeId } from '$lib/stats';

export const DEFAULT_STATS_RANGE: RangeId = 'past30Days';
export const STATS_FILTER_PARAM_KEYS = ['f', 'range', 'metrics'] as const;

export function parseStatsRange(raw: string | null): RangeId {
	return RANGE_IDS.find((r) => r === raw) ?? DEFAULT_STATS_RANGE;
}

export function statsUrlHasFilterParams(params: URLSearchParams): boolean {
	return STATS_FILTER_PARAM_KEYS.some((key) => params.has(key));
}

export function parseStatsMetrics(values: readonly string[]): MetricId[] {
	return METRIC_IDS.filter((id) => values.includes(id));
}

export function buildStatsFilterParams(
	range: RangeId,
	selectedMetrics: readonly string[]
): URLSearchParams {
	const params = new URLSearchParams();
	params.set('f', '1');
	params.set('range', range);
	for (const id of parseStatsMetrics(selectedMetrics)) params.append('metrics', id);
	return params;
}

export function parseStatsFilterPreference(raw: string | null | undefined): URLSearchParams | null {
	if (!raw) return null;
	const params = new URLSearchParams(raw);
	if (!statsUrlHasFilterParams(params)) return null;
	return buildStatsFilterParams(parseStatsRange(params.get('range')), params.getAll('metrics'));
}
