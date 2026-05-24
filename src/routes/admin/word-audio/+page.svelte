<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { PartOfSpeech } from '@prisma/client';
	import { PART_OF_SPEECH_LABELS as POS_LABELS } from '$lib/parts-of-speech';
	import BulkAudioRecorder from '$lib/components/BulkAudioRecorder.svelte';
	import type { PageData } from './$types';

	const POS_CORE = ['NOUN', 'ADJECTIVE', 'VERB'] as const satisfies readonly PartOfSpeech[];
	const POS_OTHER = [
		'ADVERB',
		'PRONOUN',
		'PREPOSITION',
		'CONJUNCTION',
		'INTERJECTION',
		'PHRASE',
		'OTHER'
	] as const satisfies readonly PartOfSpeech[];

	const BATCH_SIZES = [5, 10, 25, 50] as const;

	let { data }: { data: PageData } = $props();

	const initialQuery = untrack(() => data.q);
	const hasActiveFilters = $derived(Boolean(data.pos));
	let searchQuery = $state(initialQuery);
	let filtersOpen = $state(untrack(() => hasActiveFilters));
	let lastNavTarget = initialQuery;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	let batchSize = $state(10);
	type RecorderItem = {
		id: string;
		targetId: string;
		targetType: 'word' | 'word-plural';
		primary: string;
		secondary: string;
		badge?: string;
	};
	let sessionItems = $state<RecorderItem[] | null>(null);

	let posOtherOpen = $state(false);
	let posOtherWrap = $state<HTMLDivElement | null>(null);
	const posOtherSelected = $derived(
		Boolean(data.pos) && (POS_OTHER as readonly string[]).includes(data.pos)
	);

	const visibleTargets = $derived(data.targets.slice(0, batchSize));

	$effect(() => {
		const nextQuery = data.q;
		untrack(() => {
			if (nextQuery !== lastNavTarget.trim()) {
				searchQuery = nextQuery;
				lastNavTarget = nextQuery;
			}
		});
	});

	$effect(() => {
		if (hasActiveFilters) filtersOpen = true;
	});

	$effect(() => {
		if (!posOtherOpen) return;
		function onPointerDown(event: MouseEvent) {
			const wrap = posOtherWrap;
			if (!wrap) return;
			if (event.target instanceof Node && wrap.contains(event.target)) return;
			posOtherOpen = false;
		}
		window.addEventListener('pointerdown', onPointerDown, true);
		return () => window.removeEventListener('pointerdown', onPointerDown, true);
	});

	function navigateTo(nextQuery: string, nextPos: string) {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		lastNavTarget = nextQuery;
		const params = new URLSearchParams(page.url.searchParams);
		if (nextQuery) params.set('q', nextQuery);
		else params.delete('q');
		if (nextPos) params.set('pos', nextPos);
		else params.delete('pos');
		params.delete('missing');
		const search = params.toString();
		goto(`/admin/word-audio${search ? `?${search}` : ''}`, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	function handleSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		searchQuery = value;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			navigateTo(value, data.pos);
		}, 180);
	}

	function selectPos(nextPos: string) {
		posOtherOpen = false;
		navigateTo(searchQuery, nextPos);
	}

	function togglePosOther() {
		if (posOtherSelected) {
			selectPos('');
			return;
		}
		posOtherOpen = !posOtherOpen;
	}

	function startRecording() {
		if (visibleTargets.length === 0) return;
		sessionItems = visibleTargets.map((target) => ({
			id: target.id,
			targetId: target.targetId,
			targetType: target.targetType,
			primary: target.primary,
			secondary: target.secondary,
			badge: target.kind === 'plural' ? 'Plural' : undefined
		}));
	}

	function closeSession() {
		sessionItems = null;
	}
</script>

<svelte:head>
	<title>Word audio · Admin</title>
</svelte:head>

<h1 class="sr-only">Record word audio</h1>

<section>
	{#if sessionItems}
		<section class="form-card">
			<header class="record-section-head">
				<div>
					<h2>Recording session</h2>
					<p>{sessionItems.length} recording{sessionItems.length === 1 ? '' : 's'} selected.</p>
				</div>
				<button type="button" class="btn-sm ghost" onclick={closeSession}>Close</button>
			</header>
			<BulkAudioRecorder items={sessionItems} targetType="word" onclose={closeSession} />
		</section>
	{:else}
		<div class="controls">
			<div class="search-row">
				<div class="field search-field">
					<label for="q">Search</label>
					<input
						id="q"
						type="search"
						class="input"
						placeholder="Search Kalenjin..."
						value={searchQuery}
						oninput={handleSearchInput}
					/>
				</div>

				<div class="filter-toggle-wrap">
					<label class="filter-toggle-label" for="record-audio-filters">Options</label>
					<button
						id="record-audio-filters"
						type="button"
						class="btn-sm ghost filter-toggle"
						aria-expanded={filtersOpen}
						aria-controls="record-audio-filter-panel"
						onclick={() => (filtersOpen = !filtersOpen)}
					>
						Filter
					</button>
				</div>
			</div>

			<div
				id="record-audio-filter-panel"
				class="filters-panel"
				class:open={filtersOpen}
				hidden={!filtersOpen}
			>
				<div class="field filter-field-pos">
					<span class="field-label">Part of speech</span>
					<div class="pos-filter" role="radiogroup" aria-label="Filter by part of speech">
						<button
							type="button"
							role="radio"
							aria-checked={!data.pos}
							class="pos-pill"
							class:selected={!data.pos}
							onclick={() => selectPos('')}
						>
							All
						</button>
						{#each POS_CORE as pos (pos)}
							{@const selected = data.pos === pos}
							<button
								type="button"
								role="radio"
								aria-checked={selected}
								class="pos-pill"
								class:selected
								onclick={() => selectPos(pos)}
							>
								{POS_LABELS[pos]}
							</button>
						{/each}
						<div class="pos-other-wrap" bind:this={posOtherWrap}>
							<button
								type="button"
								aria-pressed={posOtherSelected}
								aria-haspopup="menu"
								aria-expanded={posOtherOpen}
								class="pos-pill pos-pill-other"
								class:selected={posOtherSelected}
								onclick={togglePosOther}
							>
								<span>
									{posOtherSelected ? POS_LABELS[data.pos as PartOfSpeech] : 'Other'}
								</span>
								<span class="pos-pill-caret" aria-hidden="true">▾</span>
							</button>
							{#if posOtherOpen}
								<div class="pos-other-menu" role="menu">
									{#each POS_OTHER as pos (pos)}
										{@const itemSelected = data.pos === pos}
										<button
											type="button"
											role="menuitemradio"
											aria-checked={itemSelected}
											class="pos-other-item"
											class:selected={itemSelected}
											onclick={() => selectPos(pos)}
										>
											{POS_LABELS[pos]}
										</button>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="result-meta">
			<div class="result-count">
				{data.totalTargets.toLocaleString()} recording{data.totalTargets === 1 ? '' : 's'} needed
			</div>
		</div>

		<div class="record-batch">
			<div class="batch-size" role="radiogroup" aria-label="Batch size">
				<span class="field-label">Batch size</span>
				<div class="batch-size-pills">
					{#each BATCH_SIZES as size (size)}
						<button
							type="button"
							role="radio"
							aria-checked={batchSize === size}
							class="pos-pill batch-size-pill"
							class:selected={batchSize === size}
							onclick={() => (batchSize = size)}
						>
							{size}
						</button>
					{/each}
				</div>
			</div>
			<button
				type="button"
				class="btn primary"
				onclick={startRecording}
				disabled={visibleTargets.length === 0}
			>
				Record {visibleTargets.length} {visibleTargets.length === 1 ? 'recording' : 'recordings'}
			</button>
		</div>

		{#if visibleTargets.length === 0}
			<div class="empty-state">No matching recordings to make.</div>
		{:else}
			<table class="dict-table record-table">
				<thead>
					<tr>
						<th class="col-word">Kalenjin</th>
						<th class="col-trans">Translations (English)</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleTargets as target (target.id)}
						<tr>
							<td class="col-word">
								{#if target.kind === 'plural'}
									<span class="form-badge">Plural</span>
								{/if}
								<a href={`/dictionary/${target.targetId}`}>{target.primary}</a>
							</td>
							<td class="col-trans">{target.secondary}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{/if}
</section>

<style>
	.record-section-head {
		align-items: flex-start;
		border-bottom: 1px solid var(--line-soft);
		display: flex;
		gap: 16px;
		justify-content: space-between;
		margin-bottom: 16px;
		padding-bottom: 14px;
	}
	.record-section-head h2 {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 500;
		margin: 0 0 4px;
	}
	.record-section-head p {
		color: var(--ink-mute);
		font-size: 13px;
		margin: 0;
	}

	.controls {
		align-items: stretch;
		grid-template-columns: 1fr;
	}

	.search-row {
		align-items: end;
		display: grid;
		gap: 12px;
		grid-template-columns: minmax(0, 1fr) auto;
	}
	.search-field {
		min-width: 0;
	}

	.filter-toggle-wrap {
		align-items: flex-start;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.filter-toggle-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.filter-toggle {
		min-height: 45px;
		padding-inline: 14px;
		white-space: nowrap;
	}

	.filters-panel {
		align-items: start;
		display: none;
		flex-wrap: wrap;
		gap: 10px;
		padding-top: 4px;
	}
	.filters-panel.open {
		display: flex;
	}
	.filter-field-pos {
		flex: 1 1 24rem;
		min-width: 0;
	}

	.field-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.pos-filter {
		display: flex;
		flex-wrap: nowrap;
		gap: 6px;
	}
	.pos-pill {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 10px;
		color: var(--ink);
		cursor: pointer;
		flex: 0 0 auto;
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		padding: 10px 12px;
		text-align: center;
		transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
		white-space: nowrap;
	}
	.pos-pill:hover {
		background: color-mix(in oklch, var(--brand) 8%, var(--bg-raised));
		border-color: color-mix(in oklch, var(--brand) 32%, var(--line));
	}
	.pos-pill.selected,
	.pos-pill.selected:hover {
		background: var(--brand);
		border-color: var(--brand);
		color: var(--on-brand);
	}
	.pos-other-wrap {
		flex: 0 0 auto;
		position: relative;
	}
	.pos-other-wrap .pos-pill {
		align-items: center;
		display: inline-flex;
		gap: 6px;
		justify-content: center;
	}
	.pos-pill-caret {
		font-size: 10px;
		line-height: 1;
		opacity: 0.7;
	}
	.pos-other-menu {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 10px;
		box-shadow: 0 8px 24px oklch(0 0 0 / 0.08);
		display: flex;
		flex-direction: column;
		left: 0;
		min-width: 100%;
		overflow: hidden;
		position: absolute;
		top: calc(100% + 6px);
		width: max-content;
		z-index: 5;
	}
	.pos-other-item {
		background: transparent;
		border: 0;
		color: var(--ink);
		cursor: pointer;
		font: inherit;
		font-size: 13px;
		padding: 8px 12px;
		text-align: left;
		white-space: nowrap;
	}
	.pos-other-item:hover {
		background: color-mix(in oklch, var(--brand) 10%, transparent);
	}
	.pos-other-item.selected {
		background: color-mix(in oklch, var(--brand) 16%, transparent);
		color: var(--brand-ink);
		font-weight: 600;
	}

	.record-batch {
		align-items: end;
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-bottom: 16px;
	}
	.batch-size {
		align-items: flex-start;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.batch-size-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.batch-size-pill {
		min-width: 48px;
	}
	.form-badge {
		background: color-mix(in oklch, var(--accent) 14%, transparent);
		border: 1px solid color-mix(in oklch, var(--accent) 28%, var(--line));
		border-radius: 4px;
		color: var(--ink-mute);
		display: inline-block;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.1em;
		margin-right: 6px;
		padding: 1px 6px;
		text-transform: uppercase;
		vertical-align: middle;
	}

	@media (max-width: 720px) {
		.search-row,
		.filters-panel.open {
			grid-template-columns: 1fr;
		}
		.filter-toggle-wrap {
			width: 100%;
		}
		.filters-panel.open {
			display: grid;
		}
		.filter-field-pos {
			flex: initial;
		}
		.filter-toggle {
			justify-content: center;
			width: 100%;
		}
	}
</style>
