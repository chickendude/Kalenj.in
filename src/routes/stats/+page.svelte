<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		cumulativeCellValue,
		filterEmptyBucketIndices,
		getEffectiveChangeMetrics,
		type MetricId,
		type RangeId
	} from '$lib/stats';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const METRIC_LABELS: Record<MetricId, string> = {
		wordsCreated: 'New Words',
		sentencesCreated: 'New Corpus Sentences',
		cumulativeWords: 'Total Words',
		cumulativeSentences: 'Total Corpus Sentences'
	};

	const METRIC_COLORS: Record<MetricId, string> = {
		wordsCreated: '#365e4a',
		sentencesCreated: '#c47a3a',
		cumulativeWords: '#1e3a2c',
		cumulativeSentences: '#7a4a18'
	};

	const RANGE_LABELS: Record<RangeId, string> = {
		past7Days: 'Past 7 Days',
		past30Days: 'Past 30 Days',
		pastYear: 'Past Year',
		thisWeek: 'This Week',
		thisMonth: 'This Month',
		thisYear: 'This Year',
		allTime: 'All Time'
	};

	const RANGES: RangeId[] = [
		'past7Days',
		'past30Days',
		'pastYear',
		'thisWeek',
		'thisMonth',
		'thisYear',
		'allTime'
	];

	const BUCKET_LABELS: Record<string, string> = {
		day: 'daily',
		week: 'weekly',
		month: 'monthly',
		year: 'yearly'
	};

	const stats = $derived(data.stats);
	const selected = $derived(new Set(data.selectedMetrics));

	// Buckets are UTC-aligned (Postgres `date_trunc` with UTC inputs) so format in UTC
	// to avoid off-by-one labels in non-UTC timezones.
	const dayFmt = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	const yearFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', timeZone: 'UTC' });
	const monthFmt = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		year: '2-digit',
		timeZone: 'UTC'
	});
	const monthLongFmt = new Intl.DateTimeFormat(undefined, {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const longFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });

	function formatBucket(iso: string): string {
		const d = new Date(iso);
		if (stats.bucket === 'year') return yearFmt.format(d);
		if (stats.bucket === 'month') return monthFmt.format(d);
		return dayFmt.format(d);
	}

	function formatBucketLong(iso: string): string {
		const d = new Date(iso);
		if (stats.bucket === 'year') return yearFmt.format(d);
		if (stats.bucket === 'month') return monthLongFmt.format(d);
		if (stats.bucket === 'week') {
			const end = new Date(d);
			end.setUTCDate(end.getUTCDate() + 6);
			const sameMonth =
				d.getUTCMonth() === end.getUTCMonth() && d.getUTCFullYear() === end.getUTCFullYear();
			if (sameMonth) {
				return `${dayFmt.format(d)}–${end.getUTCDate()}`;
			}
			return `${dayFmt.format(d)} – ${dayFmt.format(end)}`;
		}
		return longFmt.format(d);
	}

	const visibleMetrics = $derived(data.availableMetrics.filter((m) => selected.has(m)));

	type ChartSeries = { id: MetricId; label: string; color: string; values: number[] };

	const chartSeries = $derived.by((): ChartSeries[] => {
		return visibleMetrics.map((id) => ({
			id,
			label: METRIC_LABELS[id],
			color: METRIC_COLORS[id],
			values: stats.series[id].map((p) => p.count)
		}));
	});

	const chartLabels = $derived(stats.bucketLabels);

	const yMax = $derived.by(() => {
		let max = 0;
		for (const s of chartSeries) {
			for (const v of s.values) if (v > max) max = v;
		}
		return max === 0 ? 1 : max;
	});

	// SVG layout
	const VB_WIDTH = 800;
	const VB_HEIGHT = 320;
	const PAD_LEFT = 56;
	const PAD_RIGHT = 16;
	const PAD_TOP = 16;
	const PAD_BOTTOM = 44;
	const PLOT_W = VB_WIDTH - PAD_LEFT - PAD_RIGHT;
	const PLOT_H = VB_HEIGHT - PAD_TOP - PAD_BOTTOM;

	function xAt(i: number, total: number): number {
		if (total <= 1) return PAD_LEFT + PLOT_W / 2;
		return PAD_LEFT + (i / (total - 1)) * PLOT_W;
	}

	function yAt(value: number): number {
		return PAD_TOP + PLOT_H - (value / yMax) * PLOT_H;
	}

	function linePath(values: number[]): string {
		if (values.length === 0) return '';
		return values
			.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i, values.length).toFixed(2)},${yAt(v).toFixed(2)}`)
			.join(' ');
	}

	function yTicks(): number[] {
		const steps = 4;
		const ticks: number[] = [];
		for (let i = 0; i <= steps; i++) {
			ticks.push(Math.round((yMax / steps) * i));
		}
		return ticks;
	}

	function xTickIndexes(total: number): number[] {
		if (total <= 8) return Array.from({ length: total }, (_, i) => i);
		const targetTicks = 6;
		const step = Math.max(1, Math.floor(total / targetTicks));
		const ticks: number[] = [];
		for (let i = 0; i < total; i += step) ticks.push(i);
		if (ticks[ticks.length - 1] !== total - 1) ticks.push(total - 1);
		return ticks;
	}

	let hoverIndex = $state<number | null>(null);

	function onChartMove(event: MouseEvent) {
		const target = event.currentTarget as SVGSVGElement;
		const rect = target.getBoundingClientRect();
		const xPx = event.clientX - rect.left;
		const xVb = (xPx / rect.width) * VB_WIDTH;
		if (xVb < PAD_LEFT || xVb > VB_WIDTH - PAD_RIGHT) {
			hoverIndex = null;
			return;
		}
		const total = chartLabels.length;
		if (total === 0) {
			hoverIndex = null;
			return;
		}
		if (total === 1) {
			hoverIndex = 0;
			return;
		}
		const ratio = (xVb - PAD_LEFT) / PLOT_W;
		const idx = Math.round(ratio * (total - 1));
		hoverIndex = Math.max(0, Math.min(total - 1, idx));
	}

	function submitForm(form: HTMLFormElement) {
		const formData = new FormData(form);
		const params = new URLSearchParams();
		for (const [key, value] of formData) {
			if (typeof value !== 'string') continue;
			// Page state belongs to the table only; any range/filter change should reset to page 1.
			if (key === 'page') continue;
			params.append(key, value);
		}
		goto(`?${params.toString()}`, { noScroll: true, keepFocus: true });
	}

	function onChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const form = target.closest('form');
		if (form) submitForm(form);
	}

	function gotoPage(p: number) {
		const params = new URLSearchParams(window.location.search);
		if (p <= 1) params.delete('page');
		else params.set('page', String(p));
		const qs = params.toString();
		goto(qs ? `?${qs}` : '?', { noScroll: true, keepFocus: true });
	}

	const audioWordPct = $derived(
		stats.overview.totalWords === 0
			? 0
			: Math.round((stats.overview.wordsWithAudio / stats.overview.totalWords) * 100)
	);
	const audioSentencePct = $derived(
		stats.overview.totalSentences === 0
			? 0
			: Math.round((stats.overview.sentencesWithAudio / stats.overview.totalSentences) * 100)
	);

	const totalSelected = $derived(
		visibleMetrics.reduce(
			(sum, id) => sum + stats.series[id].reduce((s, p) => s + p.count, 0),
			0
		)
	);

	const effectiveChangeMetrics = $derived(getEffectiveChangeMetrics(visibleMetrics));

	const tableIndices = $derived(
		filterEmptyBucketIndices(chartLabels.length, stats.series, effectiveChangeMetrics).reverse()
	);

	const hiddenRowCount = $derived(chartLabels.length - tableIndices.length);

	const totalPages = $derived(Math.max(1, Math.ceil(tableIndices.length / data.pageSize)));
	const currentPage = $derived(Math.min(Math.max(1, data.page), totalPages));
	const pageIndices = $derived(
		tableIndices.slice((currentPage - 1) * data.pageSize, currentPage * data.pageSize)
	);
	const pageRangeStart = $derived(
		tableIndices.length === 0 ? 0 : (currentPage - 1) * data.pageSize + 1
	);
	const pageRangeEnd = $derived(
		Math.min(currentPage * data.pageSize, tableIndices.length)
	);

	function cellValue(id: MetricId, i: number): string {
		const v = cumulativeCellValue(id, i, stats.series);
		return v === null ? '' : v.toLocaleString();
	}
</script>

<svelte:head>
	<title>Stats · Admin</title>
</svelte:head>

<div class="page-head">
	<div>
		<h1>Stats</h1>
		<p>
			Activity over time across the dictionary and corpus. Counts use UTC bucket boundaries; very
			recent buckets may still be filling.
		</p>
	</div>
</div>

<section class="stats-overview">
	<div class="stat-card">
		<span class="stat-label">Words</span>
		<span class="stat-value">{stats.overview.totalWords.toLocaleString()}</span>
	</div>
	<div class="stat-card">
		<span class="stat-label">Corpus sentences</span>
		<span class="stat-value">{stats.overview.totalSentences.toLocaleString()}</span>
	</div>
	<div class="stat-card">
		<span class="stat-label">Words with audio</span>
		<span class="stat-value">
			{stats.overview.wordsWithAudio.toLocaleString()}
			<span class="stat-pct">{audioWordPct}%</span>
		</span>
	</div>
	<div class="stat-card">
		<span class="stat-label">Sentences with audio</span>
		<span class="stat-value">
			{stats.overview.sentencesWithAudio.toLocaleString()}
			<span class="stat-pct">{audioSentencePct}%</span>
		</span>
	</div>
</section>

<form method="GET" class="stats-controls">
	<input type="hidden" name="f" value="1" />
	<div class="control-row">
		<div class="control-group">
			<span class="control-label">Range</span>
			<div class="period-buttons" role="radiogroup" aria-label="Range">
				{#each RANGES as r}
					<label class="period-btn" class:active={data.range === r}>
						<input
							type="radio"
							name="range"
							value={r}
							checked={data.range === r}
							onchange={onChange}
						/>
						{RANGE_LABELS[r]}
					</label>
				{/each}
			</div>
		</div>
	</div>

	<fieldset class="metric-toggles">
		<legend>Filters</legend>
		{#each data.availableMetrics as id}
			<label class="metric-toggle">
				<input
					type="checkbox"
					name="metrics"
					value={id}
					checked={selected.has(id)}
					onchange={onChange}
				/>
				<span class="metric-swatch" style="background: {METRIC_COLORS[id]}"></span>
				<span>{METRIC_LABELS[id]}</span>
			</label>
		{/each}
	</fieldset>
</form>

<section class="chart-card">
	{#if visibleMetrics.length === 0}
		<p class="chart-empty">Select at least one metric to plot.</p>
	{:else}
		<div class="chart-wrap">
			<svg
				viewBox="0 0 {VB_WIDTH} {VB_HEIGHT}"
				class="chart-svg"
				role="img"
				aria-label="Activity over time"
				onmousemove={onChartMove}
				onmouseleave={() => (hoverIndex = null)}
			>
				<!-- Y gridlines + labels -->
				{#each yTicks() as tick}
					<line
						x1={PAD_LEFT}
						x2={VB_WIDTH - PAD_RIGHT}
						y1={yAt(tick)}
						y2={yAt(tick)}
						class="chart-grid"
					/>
					<text x={PAD_LEFT - 8} y={yAt(tick)} class="chart-axis" text-anchor="end" dominant-baseline="middle">
						{tick.toLocaleString()}
					</text>
				{/each}

				<!-- X axis labels -->
				{#each xTickIndexes(chartLabels.length) as i}
					<text
						x={xAt(i, chartLabels.length)}
						y={VB_HEIGHT - PAD_BOTTOM + 18}
						class="chart-axis"
						text-anchor="middle"
					>
						{formatBucket(chartLabels[i])}
					</text>
				{/each}

				<!-- Lines -->
				{#each chartSeries as s}
					<path d={linePath(s.values)} fill="none" stroke={s.color} stroke-width="2" />
					{#if s.values.length === 1}
						<circle cx={xAt(0, 1)} cy={yAt(s.values[0])} r="3.5" fill={s.color} />
					{/if}
				{/each}

				{#if hoverIndex !== null}
					<line
						x1={xAt(hoverIndex, chartLabels.length)}
						x2={xAt(hoverIndex, chartLabels.length)}
						y1={PAD_TOP}
						y2={PAD_TOP + PLOT_H}
						class="chart-hover-line"
					/>
					{#each chartSeries as s}
						<circle
							cx={xAt(hoverIndex, chartLabels.length)}
							cy={yAt(s.values[hoverIndex])}
							r="3.5"
							fill={s.color}
						/>
					{/each}
				{/if}
			</svg>

			{#if hoverIndex !== null}
				<div class="chart-tooltip">
					<div class="tooltip-bucket">{formatBucketLong(chartLabels[hoverIndex])}</div>
					{#each chartSeries as s}
						<div class="tooltip-row">
							<span class="metric-swatch" style="background: {s.color}"></span>
							<span class="tooltip-label">{s.label}</span>
							<span class="tooltip-value">{s.values[hoverIndex].toLocaleString()}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<p class="chart-summary">
			Sum across selected metrics for this range: <b>{totalSelected.toLocaleString()}</b>
		</p>
	{/if}
</section>

<section class="stats-table-section">
	<header class="stats-table-head">
		<h2>Data</h2>
		<span class="stats-table-meta">
			{BUCKET_LABELS[stats.bucket]} totals · newest first
		</span>
	</header>
	<div class="table-scroll">
		<table class="stats-table">
			<thead>
				<tr>
					<th>{stats.bucket === 'year' ? 'Year' : stats.bucket === 'month' ? 'Month' : stats.bucket === 'week' ? 'Week' : 'Day'}</th>
					{#each visibleMetrics as id}
						<th>{METRIC_LABELS[id]}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#if pageIndices.length === 0}
					<tr>
						<td colspan={visibleMetrics.length + 1} class="empty-row">
							No activity in this range.
						</td>
					</tr>
				{:else}
					{#each pageIndices as i (i)}
						<tr>
							<td>{formatBucketLong(chartLabels[i])}</td>
							{#each visibleMetrics as id}
								<td class="num">{cellValue(id, i)}</td>
							{/each}
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
	<div class="table-foot">
		<span class="table-foot-meta">
			{#if tableIndices.length === 0}
				No rows
			{:else}
				Showing {pageRangeStart.toLocaleString()}–{pageRangeEnd.toLocaleString()} of
				{tableIndices.length.toLocaleString()}
			{/if}
			{#if hiddenRowCount > 0}
				· {hiddenRowCount.toLocaleString()} empty bucket{hiddenRowCount === 1 ? '' : 's'} hidden
			{/if}
		</span>
		{#if totalPages > 1}
			<div class="pager">
				<button
					type="button"
					class="btn-sm ghost"
					disabled={currentPage <= 1}
					onclick={() => gotoPage(currentPage - 1)}
				>
					← Newer
				</button>
				<span class="pager-status">Page {currentPage} of {totalPages}</span>
				<button
					type="button"
					class="btn-sm ghost"
					disabled={currentPage >= totalPages}
					onclick={() => gotoPage(currentPage + 1)}
				>
					Older →
				</button>
			</div>
		{/if}
	</div>
</section>

<style>
	.stats-overview {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 12px;
		margin-bottom: 24px;
	}
	.stat-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 16px 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.stat-label {
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-mute);
		font-weight: 600;
	}
	.stat-value {
		font-family: var(--font-display);
		font-size: 26px;
		color: var(--ink);
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.stat-pct {
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--ink-mute);
	}

	.stats-controls {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 16px 18px;
		margin-bottom: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.control-row {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		align-items: end;
	}
	.control-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.control-label {
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-mute);
		font-weight: 600;
	}
	.period-buttons {
		display: inline-flex;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--bg-raised);
	}
	.period-btn {
		padding: 11px 18px;
		background: transparent;
		color: var(--ink);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
		border-right: 1px solid var(--line);
	}
	.period-btn:last-child {
		border-right: none;
	}
	.period-btn:hover {
		background: var(--surface);
	}
	.period-btn input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.period-btn.active {
		background: var(--brand);
		color: var(--on-brand);
	}
	.period-btn.active:hover {
		filter: brightness(1.08);
		background: var(--brand);
	}

	.metric-toggles {
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 14px 18px;
	}
	.metric-toggles legend {
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-mute);
		font-weight: 600;
		margin-bottom: 8px;
		width: 100%;
	}
	.metric-toggle {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--ink-soft);
		cursor: pointer;
		user-select: none;
	}
	.metric-toggle input {
		margin: 0;
	}
	.metric-swatch {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 3px;
	}

	.chart-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 18px;
		margin-bottom: 24px;
		position: relative;
	}
	.chart-wrap {
		position: relative;
	}
	.chart-svg {
		width: 100%;
		height: auto;
		display: block;
	}
	:global(.chart-grid) {
		stroke: var(--line-soft);
		stroke-width: 1;
	}
	:global(.chart-axis) {
		fill: var(--ink-mute);
		font-family: var(--font-mono);
		font-size: 10px;
	}
	:global(.chart-hover-line) {
		stroke: var(--ink-mute);
		stroke-width: 1;
		stroke-dasharray: 3 3;
		opacity: 0.6;
	}
	.chart-tooltip {
		position: absolute;
		top: 12px;
		right: 12px;
		background: var(--tooltip-bg);
		color: var(--tooltip-ink);
		padding: 10px 12px;
		border-radius: var(--radius);
		font-size: 12px;
		min-width: 200px;
		pointer-events: none;
		box-shadow: var(--shadow-md);
	}
	.tooltip-bucket {
		font-weight: 600;
		margin-bottom: 6px;
		opacity: 0.9;
	}
	.tooltip-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 2px 0;
	}
	.tooltip-label {
		flex: 1;
		opacity: 0.85;
	}
	.tooltip-value {
		font-family: var(--font-mono);
		font-weight: 600;
	}
	.chart-empty {
		color: var(--ink-mute);
		text-align: center;
		padding: 40px;
		margin: 0;
	}
	.chart-summary {
		margin: 12px 0 0;
		font-size: 13px;
		color: var(--ink-soft);
	}

	.stats-table-section {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 18px;
	}
	.stats-table-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 12px;
	}
	.stats-table-section h2 {
		font-family: var(--font-display);
		font-size: 18px;
		margin: 0;
		font-weight: 500;
	}
	.stats-table-meta {
		font-size: 12px;
		color: var(--ink-mute);
		text-transform: capitalize;
	}
	.empty-row {
		text-align: center;
		color: var(--ink-mute);
		font-style: italic;
		padding: 24px;
	}
	.table-scroll {
		overflow-x: auto;
	}
	.stats-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	.stats-table th,
	.stats-table td {
		text-align: left;
		padding: 8px 12px;
		border-bottom: 1px solid var(--line-soft);
		white-space: nowrap;
	}
	.stats-table th {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-mute);
		font-weight: 600;
		background: var(--surface);
	}
	.stats-table td.num {
		font-family: var(--font-mono);
		text-align: right;
	}
	.stats-table tr:last-child td {
		border-bottom: 0;
	}
	.table-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-top: 14px;
		flex-wrap: wrap;
	}
	.table-foot-meta {
		font-size: 12px;
		color: var(--ink-mute);
	}
	.pager {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}
	.pager .btn-sm:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.pager-status {
		font-size: 12px;
		color: var(--ink-soft);
		font-family: var(--font-mono);
	}
</style>
