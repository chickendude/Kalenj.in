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
	const hasActiveFilters = $derived(Boolean(data.pos) || Boolean(data.missing));
	let searchQuery = $state(initialQuery);
	let filtersOpen = $state(untrack(() => hasActiveFilters));
	let lastNavTarget = initialQuery;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	let batchSize = $state(10);
	let selectedIds = $state<Set<string>>(new Set());
	let sessionWords = $state<typeof data.words | null>(null);

	let posOtherOpen = $state(false);
	let posOtherWrap = $state<HTMLDivElement | null>(null);
	const posOtherSelected = $derived(
		Boolean(data.pos) && (POS_OTHER as readonly string[]).includes(data.pos)
	);

	$effect(() => {
		const nextQuery = data.q;
		untrack(() => {
			if (nextQuery !== lastNavTarget.trim()) {
				searchQuery = nextQuery;
				lastNavTarget = nextQuery;
			}
			selectedIds = new Set();
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

	function navigateTo(nextQuery: string, nextPos: string, nextMissing: string) {
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
		if (nextMissing) params.set('missing', nextMissing);
		else params.delete('missing');
		params.delete('page');
		const search = params.toString();
		goto(`/admin/record-audio${search ? `?${search}` : ''}`, {
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
			navigateTo(value, data.pos, data.missing);
		}, 180);
	}

	function selectMissing(nextMissing: '' | 'plural' | 'conjugation') {
		navigateTo(searchQuery, data.pos, nextMissing);
	}

	function selectPos(nextPos: string) {
		posOtherOpen = false;
		navigateTo(searchQuery, nextPos, data.missing);
	}

	function togglePosOther() {
		if (posOtherSelected) {
			selectPos('');
			return;
		}
		posOtherOpen = !posOtherOpen;
	}

	function toggleSelected(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	const allOnPageSelected = $derived(
		data.words.length > 0 && data.words.every((w) => selectedIds.has(w.id))
	);

	function selectAllOnPage() {
		const next = new Set(selectedIds);
		if (allOnPageSelected) {
			for (const word of data.words) next.delete(word.id);
		} else {
			for (const word of data.words) next.add(word.id);
		}
		selectedIds = next;
	}

	function selectFirstN(n: number) {
		const next = new Set<string>();
		for (const word of data.words.slice(0, n)) next.add(word.id);
		selectedIds = next;
	}

	function startSelected() {
		const ordered = data.words.filter((w) => selectedIds.has(w.id));
		if (ordered.length === 0) return;
		sessionWords = ordered;
	}

	function startTopBatch() {
		const ordered = data.words.slice(0, batchSize);
		if (ordered.length === 0) return;
		selectedIds = new Set(ordered.map((w) => w.id));
		sessionWords = ordered;
	}

	function closeSession() {
		sessionWords = null;
	}

	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.perPage)));
	const showingFrom = $derived(data.words.length === 0 ? 0 : (data.page - 1) * data.perPage + 1);
	const showingTo = $derived((data.page - 1) * data.perPage + data.words.length);
	const isPaginated = $derived(!data.q);

	function pageHref(nextPage: number) {
		const params = new URLSearchParams(page.url.searchParams);
		if (nextPage > 1) params.set('page', String(nextPage));
		else params.delete('page');
		const search = params.toString();
		return `/admin/record-audio${search ? `?${search}` : ''}`;
	}
</script>

<svelte:head>
	<title>Record audio · Admin</title>
</svelte:head>

<section>
	<div class="page-head">
		<div>
			<div class="page-kicker">Admin</div>
			<h1>Record audio</h1>
			<p>
				Words that don't yet have audio. Record them in bulk in one continuous take — pause about
				a second between words and the recorder will advance.
			</p>
		</div>
	</div>

	{#if sessionWords}
		<section class="form-card">
			<header class="record-section-head">
				<div>
					<h2>Recording session</h2>
					<p>{sessionWords.length} word{sessionWords.length === 1 ? '' : 's'} selected.</p>
				</div>
				<button type="button" class="btn-sm ghost" onclick={closeSession}>Close</button>
			</header>
			<BulkAudioRecorder words={sessionWords} />
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
				<div class="field filter-field-missing">
					<span class="field-label">Missing</span>
					<div class="missing-filter" role="radiogroup" aria-label="Filter by missing data">
						<button
							type="button"
							role="radio"
							aria-checked={!data.missing}
							class="pos-pill"
							class:selected={!data.missing}
							onclick={() => selectMissing('')}>None</button
						>
						<button
							type="button"
							role="radio"
							aria-checked={data.missing === 'plural'}
							class="pos-pill"
							class:selected={data.missing === 'plural'}
							onclick={() => selectMissing('plural')}>Plural</button
						>
						<button
							type="button"
							role="radio"
							aria-checked={data.missing === 'conjugation'}
							class="pos-pill"
							class:selected={data.missing === 'conjugation'}
							onclick={() => selectMissing('conjugation')}>Conjugation</button
						>
					</div>
				</div>

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
				{#if data.q}
					{data.words.length} match{data.words.length === 1 ? '' : 'es'} without audio
					{#if data.truncated}
						<span class="muted"> (showing first {data.words.length})</span>
					{/if}
				{:else}
					{showingFrom.toLocaleString()}–{showingTo.toLocaleString()} of
					{data.total.toLocaleString()} without audio
				{/if}
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
				onclick={startTopBatch}
				disabled={data.words.length === 0}
			>
				Record next {Math.min(batchSize, data.words.length)}
			</button>
			<button
				type="button"
				class="btn"
				onclick={startSelected}
				disabled={selectedIds.size === 0}
			>
				Record selected ({selectedIds.size})
			</button>
			<button
				type="button"
				class="btn-sm ghost"
				onclick={() => selectFirstN(batchSize)}
				disabled={data.words.length === 0}
			>
				Select first {Math.min(batchSize, data.words.length)}
			</button>
		</div>

		{#if data.words.length === 0}
			<div class="empty-state">No matching words without audio.</div>
		{:else}
			<table class="dict-table record-table">
				<thead>
					<tr>
						<th class="col-check">
							<input
								type="checkbox"
								aria-label="Select all on page"
								checked={allOnPageSelected}
								onchange={selectAllOnPage}
							/>
						</th>
						<th class="col-word">Kalenjin</th>
						<th class="col-trans">Translations (English)</th>
					</tr>
				</thead>
				<tbody>
					{#each data.words as word (word.id)}
						<tr class:selected={selectedIds.has(word.id)}>
							<td class="col-check">
								<input
									type="checkbox"
									aria-label={`Select ${word.kalenjin}`}
									checked={selectedIds.has(word.id)}
									onchange={() => toggleSelected(word.id)}
								/>
							</td>
							<td class="col-word">
								<a href={`/dictionary/${word.id}`}>{word.kalenjin}</a>
							</td>
							<td class="col-trans">{word.translations}</td>
						</tr>
					{/each}
				</tbody>
			</table>

			{#if isPaginated && totalPages > 1}
				<nav class="record-pager" aria-label="Pagination">
					<div class="record-pager-actions">
						{#if data.page > 1}
							<a class="btn-sm" href={pageHref(data.page - 1)}>Previous</a>
						{/if}
						{#if data.page < totalPages}
							<a class="btn-sm" href={pageHref(data.page + 1)}>Next</a>
						{/if}
					</div>
				</nav>
			{/if}
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
	.filter-field-missing {
		flex: 0 0 auto;
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

	.pos-filter,
	.missing-filter {
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

	.record-table .col-check {
		width: 36px;
	}
	.record-table tr.selected {
		background: color-mix(in oklch, var(--brand) 6%, transparent);
	}

	.record-pager {
		display: flex;
		justify-content: flex-end;
		margin-top: 16px;
	}
	.record-pager-actions {
		display: flex;
		gap: 6px;
	}

	.muted {
		color: var(--ink-mute);
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
		.filter-field-missing,
		.filter-field-pos {
			flex: initial;
		}
		.filter-toggle {
			justify-content: center;
			width: 100%;
		}
	}
</style>
