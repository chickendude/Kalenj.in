<script lang="ts">
	import LemmaFormFields from './LemmaFormFields.svelte';
	import { PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import type { PartOfSpeech } from '@prisma/client';

	type SearchResult = {
		id: string;
		kalenjin: string;
		translations: string;
		partOfSpeech?: PartOfSpeech | string | null;
	};

	let {
		searchEndpoint,
		idPrefix = 'lemma-picker',
		initialQuery = '',
		selectedWord = $bindable<SearchResult | null>(null),
		mode = $bindable<'search' | 'create'>('search'),
		draftKalenjin = $bindable(''),
		draftTranslations = $bindable(''),
		draftAlternativeSpellings = $bindable(''),
		draftNotes = $bindable(''),
		draftPartOfSpeech = $bindable<PartOfSpeech | ''>(''),
		draftPluralForm = $bindable(''),
		draftIsPluralOnly = $bindable(false),
		draftPresentAnee = $bindable(''),
		draftPresentInyee = $bindable(''),
		draftPresentInee = $bindable(''),
		draftPresentEchek = $bindable(''),
		draftPresentOkwek = $bindable(''),
		draftPresentIchek = $bindable('')
	}: {
		searchEndpoint: string;
		idPrefix?: string;
		initialQuery?: string;
		selectedWord?: SearchResult | null;
		mode?: 'search' | 'create';
		draftKalenjin?: string;
		draftTranslations?: string;
		draftAlternativeSpellings?: string;
		draftNotes?: string;
		draftPartOfSpeech?: PartOfSpeech | '';
		draftPluralForm?: string;
		draftIsPluralOnly?: boolean;
		draftPresentAnee?: string;
		draftPresentInyee?: string;
		draftPresentInee?: string;
		draftPresentEchek?: string;
		draftPresentOkwek?: string;
		draftPresentIchek?: string;
	} = $props();

	let searchQuery = $state(initialQuery);
	let searchResults = $state<SearchResult[]>([]);
	let searchLoading = $state(false);
	let searchError = $state<string | null>(null);
	let searchCache = $state<Record<string, SearchResult[]>>({});

	$effect(() => {
		const query = searchQuery.trim();
		if (!query) {
			searchResults = [];
			searchLoading = false;
			searchError = null;
			return;
		}

		if (Object.prototype.hasOwnProperty.call(searchCache, query)) {
			searchResults = searchCache[query];
			searchLoading = false;
			searchError = null;
			return;
		}

		const controller = new AbortController();
		const timeout = window.setTimeout(async () => {
			searchLoading = true;
			searchError = null;

			try {
				const response = await fetch(
					`${searchEndpoint}?q=${encodeURIComponent(query)}`,
					{ signal: controller.signal }
				);

				if (!response.ok) {
					throw new Error('Search failed.');
				}

				const payload = (await response.json()) as { results?: SearchResult[] };
				searchResults = payload.results ?? [];
				searchCache = { ...searchCache, [query]: searchResults };
			} catch (error) {
				if (controller.signal.aborted) {
					return;
				}

				console.error(error);
				searchResults = [];
				searchError = 'Could not search right now.';
			} finally {
				if (!controller.signal.aborted) {
					searchLoading = false;
				}
			}
		}, 150);

		return () => {
			controller.abort();
			window.clearTimeout(timeout);
		};
	});

	function selectResult(result: SearchResult) {
		selectedWord = result;
		mode = 'search';
	}

	function clearSelection() {
		selectedWord = null;
	}

	function switchToCreate() {
		selectedWord = null;
		mode = 'create';
		if (!draftKalenjin) {
			draftKalenjin = searchQuery.trim();
		}
	}

	function switchToSearch() {
		mode = 'search';
	}

	function posLabel(value: string | null | undefined): string | null {
		if (!value) return null;
		const key = value as PartOfSpeech;
		return PART_OF_SPEECH_LABELS[key] ?? value;
	}
</script>

<div class="lemma-picker">
	{#if mode === 'search' && selectedWord}
		<input type="hidden" name="wordId" value={selectedWord.id} />
	{/if}

	{#if mode === 'search'}
		<div class="picker-search-block">
			<label class="picker-search-label" for="{idPrefix}-search">Search for a lemma</label>
			<input
				id="{idPrefix}-search"
				class="input picker-search-input"
				bind:value={searchQuery}
				placeholder="Type a Kalenjin word or English translation…"
				autocomplete="off"
			/>

			{#if selectedWord}
				<div class="picker-selected" aria-live="polite">
					<div class="picker-selected-text">
						<span class="picker-selected-word">{selectedWord.kalenjin}</span>
						<span class="picker-selected-gloss">{selectedWord.translations}</span>
						{#if posLabel(selectedWord.partOfSpeech)}
							<span class="picker-selected-pos">{posLabel(selectedWord.partOfSpeech)}</span>
						{/if}
					</div>
					<button type="button" class="picker-linkbtn" onclick={clearSelection}>Change</button>
				</div>
			{:else}
				<div class="picker-hit-rail" role="list">
					{#if searchError}
						<div class="picker-hit-empty error-text">{searchError}</div>
					{:else if searchLoading}
						<div class="picker-hit-empty" aria-live="polite" aria-label="Searching">
							<span class="loading-spinner" aria-hidden="true"></span>
						</div>
					{:else if searchResults.length === 0}
						<div class="picker-hit-empty">
							{#if searchQuery.trim()}
								No lemmas match "{searchQuery}".
							{:else}
								Type to search existing lemmas.
							{/if}
						</div>
					{:else}
						{#each searchResults as result}
							<button
								type="button"
								class="picker-hit"
								onclick={() => selectResult(result)}
								title={`${result.kalenjin} — ${result.translations}`}
							>
								<span class="picker-hit-word">{result.kalenjin}</span>
								<span class="picker-hit-gloss">{result.translations}</span>
							</button>
						{/each}
					{/if}
				</div>
			{/if}

			<div class="picker-actions">
				<button type="button" class="picker-linkbtn" onclick={switchToCreate}>
					+ Create new lemma{searchQuery.trim() ? ` "${searchQuery.trim()}"` : ''}
				</button>
			</div>
		</div>
	{:else}
		<div class="picker-create-block">
			<div class="picker-create-head">
				<span class="picker-create-label">Create new lemma</span>
				<button type="button" class="picker-linkbtn" onclick={switchToSearch}>
					← Back to search
				</button>
			</div>
			<LemmaFormFields
				bind:kalenjin={draftKalenjin}
				bind:translations={draftTranslations}
				bind:alternativeSpellings={draftAlternativeSpellings}
				bind:notes={draftNotes}
				bind:partOfSpeech={draftPartOfSpeech}
				bind:pluralForm={draftPluralForm}
				bind:isPluralOnly={draftIsPluralOnly}
				bind:presentAnee={draftPresentAnee}
				bind:presentInyee={draftPresentInyee}
				bind:presentInee={draftPresentInee}
				bind:presentEchek={draftPresentEchek}
				bind:presentOkwek={draftPresentOkwek}
				bind:presentIchek={draftPresentIchek}
				idPrefix={`${idPrefix}-create`}
			/>
		</div>
	{/if}
</div>

<style>
	.lemma-picker {
		display: block;
	}

	.input {
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: 8px;
		color: var(--ink);
		font: inherit;
		padding: 8px 10px;
		width: 100%;
	}
	.input:focus {
		border-color: var(--brand);
		outline: 2px solid color-mix(in oklch, var(--brand) 30%, transparent);
		outline-offset: 1px;
	}

	.picker-search-block {
		display: block;
	}

	.picker-search-label {
		color: var(--ink-mute);
		display: block;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.14em;
		margin-bottom: 6px;
		text-transform: uppercase;
	}

	.picker-search-input {
		font-family: var(--font-display);
		font-size: 17px;
	}

	.picker-hit-rail {
		display: flex;
		gap: 8px;
		margin-top: 10px;
		overflow-x: auto;
		padding: 2px 2px 8px;
		scrollbar-width: thin;
	}
	.picker-hit-rail::-webkit-scrollbar {
		height: 8px;
	}
	.picker-hit-rail::-webkit-scrollbar-thumb {
		background: var(--line);
		border-radius: 4px;
	}

	.picker-hit {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		cursor: pointer;
		display: flex;
		flex: 0 0 auto;
		flex-direction: column;
		font: inherit;
		gap: 2px;
		min-width: 140px;
		padding: 10px 14px;
		text-align: left;
		transition: border-color 0.12s, background 0.12s;
	}
	.picker-hit:hover {
		background: var(--surface);
		border-color: var(--ink-mute);
	}
	.picker-hit-word {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 500;
	}
	.picker-hit-gloss {
		color: var(--ink-soft);
		font-size: 12px;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.picker-hit-empty {
		color: var(--ink-mute);
		flex: 1;
		font-size: 13px;
		font-style: italic;
		padding: 14px 10px;
	}

	.picker-selected {
		align-items: center;
		background: color-mix(in oklch, var(--accent) 14%, var(--paper));
		border: 1px solid color-mix(in oklch, var(--accent) 32%, var(--line));
		border-radius: 12px;
		display: flex;
		gap: 12px;
		justify-content: space-between;
		margin-top: 10px;
		padding: 10px 14px;
	}
	.picker-selected-text {
		align-items: baseline;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.picker-selected-word {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 500;
	}
	.picker-selected-gloss {
		color: var(--ink-soft);
		font-size: 13px;
	}
	.picker-selected-pos {
		background: color-mix(in oklch, var(--brand) 16%, transparent);
		border-radius: 999px;
		color: var(--brand-ink);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		padding: 2px 8px;
		text-transform: uppercase;
	}

	.picker-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 8px;
	}

	.picker-linkbtn {
		background: none;
		border: 0;
		color: var(--brand);
		cursor: pointer;
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		padding: 4px 0;
	}
	.picker-linkbtn:hover {
		text-decoration: underline;
	}

	.picker-create-block {
		display: block;
	}
	.picker-create-head {
		align-items: center;
		display: flex;
		justify-content: space-between;
		margin-bottom: 10px;
	}
	.picker-create-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.loading-spinner {
		animation: spin 720ms linear infinite;
		border: 2px solid var(--info-soft);
		border-radius: 999px;
		border-top-color: var(--info);
		display: inline-block;
		height: 18px;
		vertical-align: middle;
		width: 18px;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-text {
		color: var(--danger);
	}
</style>
