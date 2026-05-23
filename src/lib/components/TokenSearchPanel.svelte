<script lang="ts">
	import { enhance } from '$app/forms';
	import { stripWordLinks } from '$lib/word-links';
	import type { ActionResult } from '@sveltejs/kit';

	type SearchResult = {
		id: string;
		kalenjin: string;
		translations: string;
		notes?: string | null;
	};

	type EnhancedSubmitResult = ActionResult<Record<string, unknown> | undefined, Record<string, unknown> | undefined>;
	type EnhancedUpdate = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;
	type EnhanceHandler = (args: { result: EnhancedSubmitResult; update: EnhancedUpdate }) => Promise<void>;

	let {
		initialQuery,
		focusKey,
		placeholder,
		activeWordId,
		activeTokenId,
		activeSegmentId = null,
		inContextTranslation,
		entityId,
		entityIdField,
		updateAction,
		searchEndpoint,
		onQueryChange,
		onPickEnhance
	}: {
		initialQuery: string;
		focusKey: string;
		placeholder: string;
		activeWordId: string | null;
		activeTokenId: string;
		activeSegmentId?: string | null;
		inContextTranslation: string;
		entityId: string;
		entityIdField: string;
		updateAction: string;
		searchEndpoint: string;
		onQueryChange: (query: string) => void;
		onPickEnhance: () => EnhanceHandler;
	} = $props();

	let searchQuery = $state(initialQuery);
	let searchResults = $state<SearchResult[]>([]);
	let searchLoading = $state(false);
	let searchError = $state<string | null>(null);
	let searchResultCache = $state<Record<string, SearchResult[]>>({});
	let searchInput = $state<HTMLInputElement | null>(null);
	let lastInitKey = $state<string | null>(null);
	let lastFocusKey = $state<string | null>(null);

	$effect(() => {
		// Re-init the query when the parent activates a new token/segment.
		if (focusKey !== lastInitKey) {
			lastInitKey = focusKey;
			searchQuery = initialQuery;
			searchResults = [];
			searchError = null;
		}
	});

	$effect(() => {
		if (focusKey === lastFocusKey) return;
		const timeout = window.setTimeout(() => {
			searchInput?.focus();
			searchInput?.select();
			lastFocusKey = focusKey;
		}, 0);
		return () => window.clearTimeout(timeout);
	});

	$effect(() => {
		const currentQuery = searchQuery.trim();
		if (!currentQuery) {
			searchResults = [];
			searchLoading = false;
			searchError = null;
			return;
		}

		if (Object.prototype.hasOwnProperty.call(searchResultCache, currentQuery)) {
			searchResults = searchResultCache[currentQuery];
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
					`${searchEndpoint}?q=${encodeURIComponent(currentQuery)}`,
					{ signal: controller.signal }
				);

				if (!response.ok) {
					throw new Error('Search failed.');
				}

				const payload = (await response.json()) as { results?: SearchResult[] };
				searchResults = payload.results ?? [];
				searchResultCache = {
					...searchResultCache,
					[currentQuery]: searchResults
				};
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

	function handleInput(value: string) {
		searchQuery = value;
		onQueryChange(value);
	}
</script>

<div class="lemma-search-block">
	<input
		bind:this={searchInput}
		class="input lemma-search-input"
		value={searchQuery}
		{placeholder}
		oninput={(event) => handleInput((event.currentTarget as HTMLInputElement).value)}
	/>
	<div class="lemma-hit-rail" role="list">
		{#if searchError}
			<div class="lemma-hit-empty error-text">{searchError}</div>
		{:else if searchLoading}
			<div class="lemma-hit-empty" aria-live="polite" aria-label="Searching">
				<span class="loading-spinner" aria-hidden="true"></span>
			</div>
		{:else if searchResults.length === 0}
			<div class="lemma-hit-empty">
				{#if searchQuery.trim()}
					No lemmas match "{searchQuery}".
				{:else}
					Type to search existing lemmas.
				{/if}
			</div>
		{:else}
			{#each searchResults as result}
				<form
					method="POST"
					action={updateAction}
					class="lemma-hit-form"
					use:enhance={onPickEnhance}
				>
					<input type="hidden" name={entityIdField} value={entityId} />
					<input type="hidden" name="tokenId" value={activeTokenId} />
					{#if activeSegmentId}
						<input type="hidden" name="segmentId" value={activeSegmentId} />
					{/if}
					<input type="hidden" name="wordId" value={result.id} />
					<input
						type="hidden"
						name="inContextTranslation"
						value={inContextTranslation}
					/>
					<button
						type="submit"
						class="lemma-hit"
						class:active={activeWordId === result.id}
						title={`${result.kalenjin} — ${stripWordLinks(result.translations)}`}
					>
						<span class="lemma-hit-word">{result.kalenjin}</span>
						<span class="lemma-hit-gloss">{stripWordLinks(result.translations)}</span>
					</button>
				</form>
			{/each}
		{/if}
	</div>
</div>

<style>
	.lemma-search-block {
		margin-bottom: 16px;
	}
	.lemma-search-input {
		font-family: var(--font-display);
		font-size: 17px;
		width: 100%;
	}
	.lemma-hit-rail {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding: 10px 2px 8px;
		scrollbar-width: thin;
	}
	.lemma-hit-rail::-webkit-scrollbar { height: 8px; }
	.lemma-hit-rail::-webkit-scrollbar-thumb {
		background: var(--line);
		border-radius: 4px;
	}
	.lemma-hit-form {
		flex: 0 0 auto;
		margin: 0;
	}
	.lemma-hit {
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
	.lemma-hit:hover {
		background: var(--surface);
		border-color: var(--ink-mute);
	}
	.lemma-hit.active {
		background: var(--accent-soft);
		border-color: var(--brand);
		box-shadow: inset 0 0 0 1px var(--brand);
	}
	.lemma-hit-word {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 500;
		letter-spacing: -0.005em;
	}
	.lemma-hit-gloss {
		color: var(--ink-soft);
		font-size: 12px;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lemma-hit-empty {
		color: var(--ink-mute);
		flex: 1;
		font-size: 13px;
		font-style: italic;
		padding: 14px 10px;
	}
	.error-text {
		color: var(--danger);
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
		to { transform: rotate(360deg); }
	}
</style>
