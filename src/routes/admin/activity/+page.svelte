<script lang="ts">
	import { goto } from '$app/navigation';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import { RANGE_IDS, RANGE_LABELS, RANGE_SHORT_LABELS, type RangeId } from '$lib/stats';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const numberFmt = new Intl.NumberFormat();

	const showRangeColumns = $derived(data.range !== 'allTime');
	const hasUnattributed = $derived(
		data.activity.unattributed.words > 0 || data.activity.unattributed.sentences > 0
	);

	function onRangeChange(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value as RangeId;
		void goto(`/admin/activity?range=${value}`, { keepFocus: true, noScroll: true });
	}

	function entriesHref(userId: string, type: 'words' | 'sentences', range: RangeId): string {
		return `/admin/activity/${userId}?type=${type}&range=${range}`;
	}
</script>

<svelte:head>
	<title>Activity · Admin</title>
</svelte:head>

<form method="GET" class="range-controls">
	<span class="control-label">Range</span>
	<div class="period-buttons" role="radiogroup" aria-label="Range">
		{#each RANGE_IDS as r (r)}
			<Tooltip label={RANGE_LABELS[r]} placement="bottom">
				<label class="period-btn" class:active={data.range === r}>
					<input
						type="radio"
						name="range"
						value={r}
						checked={data.range === r}
						onchange={onRangeChange}
					/>
					{RANGE_SHORT_LABELS[r]}
				</label>
			</Tooltip>
		{/each}
	</div>
</form>

<table class="users-table">
	<thead>
		<tr>
			<th>User</th>
			<th>Role</th>
			<th class="num">Words{showRangeColumns ? ` · ${RANGE_SHORT_LABELS[data.range]}` : ''}</th>
			<th class="num">
				Sentences{showRangeColumns ? ` · ${RANGE_SHORT_LABELS[data.range]}` : ''}
			</th>
		</tr>
	</thead>
	<tbody>
		{#each data.activity.rows as row (row.userId)}
			{@const words = showRangeColumns ? row.wordsInRange : row.words}
			{@const sentences = showRangeColumns ? row.sentencesInRange : row.sentences}
			<tr>
				<td>
					<strong>{row.username}</strong>
					{#if row.displayName}
						<span class="display-name">{row.displayName}</span>
					{/if}
				</td>
				<td><span class="role-pill {row.role.toLowerCase()}">{row.role}</span></td>
				<td class="num">
					{#if words > 0}
						<a href={entriesHref(row.userId, 'words', data.range)}>{numberFmt.format(words)}</a>
					{:else}
						{numberFmt.format(words)}
					{/if}
				</td>
				<td class="num">
					{#if sentences > 0}
						<a href={entriesHref(row.userId, 'sentences', data.range)}>
							{numberFmt.format(sentences)}
						</a>
					{:else}
						{numberFmt.format(sentences)}
					{/if}
				</td>
			</tr>
		{/each}
	</tbody>
</table>

{#if hasUnattributed}
	<p class="unattributed-note">
		{numberFmt.format(data.activity.unattributed.words)} word{data.activity.unattributed.words === 1
			? ''
			: 's'} and {numberFmt.format(data.activity.unattributed.sentences)} sentence{data.activity
			.unattributed.sentences === 1
			? ''
			: 's'} have no recorded author — they were added before creator tracking, or their author's
		account was deleted.
	</p>
{/if}

<style>
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.display-name {
		margin-left: 6px;
		color: var(--ink-mute);
		font-size: 0.9em;
	}

	.unattributed-note {
		margin-top: 1rem;
		color: var(--ink-mute);
		font-size: 0.9rem;
	}

	.range-controls {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 1.25rem;
	}

	.control-label {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-mute);
	}

	.period-buttons {
		display: inline-flex;
		max-width: 100%;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--bg-raised);
	}

	/* Each range button is wrapped in a Tooltip, which renders a .tooltip-host
	   span between .period-buttons and the label. Segment separators and end
	   rounding live on that wrapper. */
	.period-buttons :global(.tooltip-host) {
		border-right: 1px solid var(--line);
	}

	.period-buttons :global(.tooltip-host:last-child) {
		border-right: none;
	}

	.period-btn {
		display: inline-block;
		padding: 9px 13px;
		background: transparent;
		color: var(--ink);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}

	.period-buttons :global(.tooltip-host:first-child .period-btn) {
		border-top-left-radius: var(--radius);
		border-bottom-left-radius: var(--radius);
	}

	.period-buttons :global(.tooltip-host:last-child .period-btn) {
		border-top-right-radius: var(--radius);
		border-bottom-right-radius: var(--radius);
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
</style>
