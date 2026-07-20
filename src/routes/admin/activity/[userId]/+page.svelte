<script lang="ts">
	import Tooltip from '$lib/components/Tooltip.svelte';
	import { RANGE_IDS, RANGE_LABELS, RANGE_SHORT_LABELS } from '$lib/stats';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const numberFmt = new Intl.NumberFormat();
	const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	const displayName = $derived(data.targetUser.displayName ?? data.targetUser.username);
	const pageCount = $derived(Math.max(1, Math.ceil(data.totalCount / data.pageSize)));

	function pageHref({
		type = data.type,
		range = data.range,
		page = 1
	}: {
		type?: 'words' | 'sentences';
		range?: string;
		page?: number;
	}): string {
		const params = new URLSearchParams({ type, range });
		if (page > 1) params.set('page', String(page));
		return `/admin/activity/${data.targetUser.id}?${params.toString()}`;
	}
</script>

<svelte:head>
	<title>{displayName}'s {data.type} · Admin</title>
</svelte:head>

<div class="page-head">
	<div>
		<div class="page-kicker">
			<a href="/admin/activity?range={data.range}">Staff activity</a>
		</div>
		<h1>
			{data.type === 'words' ? 'Words' : 'Sentences'} added by {displayName}
			<span class="role-pill {data.targetUser.role.toLowerCase()}">{data.targetUser.role}</span>
		</h1>
		<p>{RANGE_LABELS[data.range]} · newest first.</p>
	</div>
	<div class="page-stat">
		<b>{numberFmt.format(data.totalCount)}</b>
		{data.type === 'words'
			? `word${data.totalCount === 1 ? '' : 's'}`
			: `sentence${data.totalCount === 1 ? '' : 's'}`}
	</div>
</div>

<div class="entry-controls">
	<div class="type-tabs" role="tablist" aria-label="Entry type">
		<a
			href={pageHref({ type: 'words' })}
			class="type-tab"
			class:active={data.type === 'words'}
			aria-current={data.type === 'words' ? 'page' : undefined}>Words</a
		>
		<a
			href={pageHref({ type: 'sentences' })}
			class="type-tab"
			class:active={data.type === 'sentences'}
			aria-current={data.type === 'sentences' ? 'page' : undefined}>Sentences</a
		>
	</div>
	<div class="period-buttons" role="radiogroup" aria-label="Range">
		{#each RANGE_IDS as r (r)}
			<Tooltip label={RANGE_LABELS[r]} placement="bottom">
				<a
					href={pageHref({ range: r })}
					class="period-btn"
					class:active={data.range === r}
					aria-current={data.range === r ? 'page' : undefined}
				>
					{RANGE_SHORT_LABELS[r]}
				</a>
			</Tooltip>
		{/each}
	</div>
</div>

{#if data.entries.length === 0}
	<p class="empty-note">
		No {data.type} added by {displayName} in this range.
	</p>
{:else}
	<table class="users-table">
		<thead>
			<tr>
				<th>Kalenjin</th>
				<th>{data.type === 'words' ? 'Translations' : 'English'}</th>
				<th class="num">Added</th>
			</tr>
		</thead>
		<tbody>
			{#each data.entries as entry (entry.id)}
				<tr>
					<td><a href={entry.href}><strong>{entry.kalenjin}</strong></a></td>
					<td>{entry.english}</td>
					<td class="num">{dateFmt.format(entry.createdAt)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

{#if pageCount > 1}
	<nav class="pagination" aria-label="Pages">
		{#if data.page > 1}
			<a class="btn-sm ghost" href={pageHref({ page: data.page - 1 })}>← Previous</a>
		{/if}
		<span class="page-indicator">Page {data.page} of {pageCount}</span>
		{#if data.page < pageCount}
			<a class="btn-sm ghost" href={pageHref({ page: data.page + 1 })}>Next →</a>
		{/if}
	</nav>
{/if}

<style>
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.page-kicker a {
		color: inherit;
	}

	.page-head h1 .role-pill {
		vertical-align: middle;
		margin-left: 8px;
	}

	.entry-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
		margin-bottom: 1.25rem;
	}

	.type-tabs {
		display: inline-flex;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--bg-raised);
		overflow: hidden;
	}

	.type-tab {
		padding: 9px 16px;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
		text-decoration: none;
	}

	.type-tab + .type-tab {
		border-left: 1px solid var(--line);
	}

	.type-tab:hover {
		background: var(--surface);
		text-decoration: none;
	}

	.type-tab.active {
		background: var(--brand);
		color: var(--on-brand);
	}

	.period-buttons {
		display: inline-flex;
		max-width: 100%;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--bg-raised);
	}

	/* Each range button is wrapped in a Tooltip, which renders a .tooltip-host
	   span between .period-buttons and the link. Segment separators and end
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
		text-decoration: none;
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
		text-decoration: none;
	}

	.period-btn.active {
		background: var(--brand);
		color: var(--on-brand);
	}

	.empty-note {
		color: var(--ink-mute);
	}

	.pagination {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 1.25rem;
	}

	.page-indicator {
		color: var(--ink-mute);
		font-size: 0.9rem;
	}
</style>
