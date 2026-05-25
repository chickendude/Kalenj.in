<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BulkAudioRecorder from '$lib/components/BulkAudioRecorder.svelte';
	import type { CorpusSearchLanguage } from '$lib/server/corpus-search';
	import type { PageData } from './$types';

	const BATCH_SIZES = [3, 5, 10, 20] as const;
	const LANG_OPTIONS: { value: CorpusSearchLanguage; label: string }[] = [
		{ value: 'kalenjin', label: 'Kalenjin' },
		{ value: 'english', label: 'English' },
		{ value: 'both', label: 'Both' }
	];

	let { data }: { data: PageData } = $props();

	const initialQuery = untrack(() => data.q);
	let searchQuery = $state(initialQuery);
	let lastNavTarget = initialQuery;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	let batchSize = $state(5);
	type RecorderItem = { id: string; primary: string; secondary: string };
	let sessionItems = $state<RecorderItem[] | null>(null);

	const visibleSentences = $derived(data.sentences.slice(0, batchSize));

	$effect(() => {
		const nextQuery = data.q;
		untrack(() => {
			if (nextQuery !== lastNavTarget.trim()) {
				searchQuery = nextQuery;
				lastNavTarget = nextQuery;
			}
		});
	});

	function navigateTo(nextQuery: string, nextLang: CorpusSearchLanguage) {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		lastNavTarget = nextQuery;
		const params = new URLSearchParams(page.url.searchParams);
		if (nextQuery) params.set('q', nextQuery);
		else params.delete('q');
		if (nextLang && nextLang !== 'kalenjin') params.set('lang', nextLang);
		else params.delete('lang');
		const search = params.toString();
		goto(`/admin/sentence-audio${search ? `?${search}` : ''}`, {
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
			navigateTo(value, data.language);
		}, 180);
	}

	function selectLang(next: CorpusSearchLanguage) {
		navigateTo(searchQuery, next);
	}

	function startRecording() {
		if (visibleSentences.length === 0) return;
		sessionItems = visibleSentences.map((s) => ({
			id: s.id,
			primary: s.kalenjin,
			secondary: s.english
		}));
	}

	function closeSession() {
		sessionItems = null;
	}
</script>

<svelte:head>
	<title>Sentence audio · Admin</title>
</svelte:head>

<h1 class="sr-only">Record sentence audio</h1>

<section>
	{#if sessionItems}
		<section class="form-card">
			<header class="record-section-head">
				<div>
					<h2>Recording session</h2>
					<p>
						{sessionItems.length} sentence{sessionItems.length === 1 ? '' : 's'} selected.
					</p>
				</div>
				<button type="button" class="btn-sm ghost" onclick={closeSession}>Close</button>
			</header>
			<BulkAudioRecorder items={sessionItems} targetType="sentence" onclose={closeSession} />
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
						placeholder="Search sentences..."
						value={searchQuery}
						oninput={handleSearchInput}
					/>
				</div>
			</div>

			<div class="lang-row">
				<span class="field-label">Search in</span>
				<div class="lang-pills" role="radiogroup" aria-label="Language to search">
					{#each LANG_OPTIONS as opt (opt.value)}
						{@const selected = data.language === opt.value}
						<button
							type="button"
							role="radio"
							aria-checked={selected}
							class="pos-pill"
							class:selected
							onclick={() => selectLang(opt.value)}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>
		</div>

		<div class="result-meta">
			<div class="result-count">
				{data.total.toLocaleString()} sentence{data.total === 1 ? '' : 's'} without audio
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
				disabled={visibleSentences.length === 0}
			>
				Record {visibleSentences.length} sentence{visibleSentences.length === 1 ? '' : 's'}
			</button>
		</div>

		{#if visibleSentences.length === 0}
			<div class="empty-state">No matching sentences without audio.</div>
		{:else}
			<table class="dict-table record-table">
				<thead>
					<tr>
						<th class="col-word">Kalenjin</th>
						<th class="col-trans">English</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleSentences as sentence (sentence.id)}
						<tr>
							<td class="col-word">
								<a href={`/corpus/${sentence.id}`}>{sentence.kalenjin}</a>
							</td>
							<td class="col-trans">{sentence.english}</td>
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
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.search-row {
		align-items: end;
		display: grid;
		gap: 12px;
		grid-template-columns: minmax(0, 1fr);
	}
	.search-field {
		min-width: 0;
	}

	.lang-row {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.lang-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.field-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
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
</style>
