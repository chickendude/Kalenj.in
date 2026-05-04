<script lang="ts">
	type SearchResult = {
		id: string;
		[key: string]: unknown;
	};

	let {
		searchEndpoint,
		query,
		linkBase,
		primaryKey,
		secondaryKey,
		label,
		minQueryLength = 2
	}: {
		searchEndpoint: string;
		query: string;
		linkBase: string;
		primaryKey: string;
		secondaryKey: string;
		label: string;
		minQueryLength?: number;
	} = $props();

	let results = $state<SearchResult[]>([]);
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
	let cache = $state<Record<string, SearchResult[]>>({});

	$effect(() => {
		const trimmed = query.trim();
		if (trimmed.length < minQueryLength) {
			results = [];
			loading = false;
			errorMessage = null;
			return;
		}

		const cacheKey = `${searchEndpoint}::${trimmed}`;
		if (Object.prototype.hasOwnProperty.call(cache, cacheKey)) {
			results = cache[cacheKey];
			loading = false;
			errorMessage = null;
			return;
		}

		const controller = new AbortController();
		const timeoutId = window.setTimeout(async () => {
			loading = true;
			errorMessage = null;

			try {
				const separator = searchEndpoint.includes('?') ? '&' : '?';
				const response = await fetch(
					`${searchEndpoint}${separator}q=${encodeURIComponent(trimmed)}`,
					{ signal: controller.signal }
				);
				if (!response.ok) throw new Error('Search failed.');
				const payload = (await response.json()) as { results?: SearchResult[] };
				const next = payload.results ?? [];
				results = next;
				cache = { ...cache, [cacheKey]: next };
			} catch (err) {
				if (controller.signal.aborted) return;
				console.error(err);
				results = [];
				errorMessage = 'Could not check for duplicates right now.';
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		}, 220);

		return () => {
			controller.abort();
			window.clearTimeout(timeoutId);
		};
	});

	function getString(value: unknown): string {
		return typeof value === 'string' ? value : '';
	}
</script>

{#if results.length > 0 || loading || errorMessage}
	<div class="dup-panel" role="status" aria-live="polite">
		<div class="dup-head">
			{#if loading}
				<span class="dup-spinner" aria-hidden="true"></span>
				Checking for duplicates…
			{:else if errorMessage}
				<span class="dup-error">{errorMessage}</span>
			{:else}
				{label} ({results.length})
			{/if}
		</div>
		{#if !loading && !errorMessage && results.length > 0}
			<ul class="dup-list">
				{#each results as result (result.id)}
					<li class="dup-item">
						<a
							class="dup-link"
							href={`${linkBase}${result.id}`}
							target="_blank"
							rel="noopener"
						>
							<span class="dup-primary">{getString(result[primaryKey])}</span>
							<span class="dup-sep" aria-hidden="true">—</span>
							<span class="dup-secondary">{getString(result[secondaryKey])}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<style>
	.dup-panel {
		background: color-mix(in oklch, var(--accent) 8%, var(--paper));
		border: 1px solid color-mix(in oklch, var(--accent) 28%, var(--line));
		border-radius: 10px;
		padding: 10px 12px;
	}
	.dup-head {
		align-items: center;
		color: var(--ink-soft);
		display: flex;
		font-size: 12px;
		font-weight: 600;
		gap: 8px;
		letter-spacing: 0.04em;
		margin-bottom: 6px;
	}
	.dup-error {
		color: var(--danger);
	}
	.dup-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.dup-item {
		margin: 0;
	}
	.dup-link {
		align-items: baseline;
		border-radius: 6px;
		color: var(--ink);
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 5px 8px;
		text-decoration: none;
		transition: background 0.12s;
	}
	.dup-link:hover,
	.dup-link:focus-visible {
		background: color-mix(in oklch, var(--brand) 12%, transparent);
		outline: none;
		text-decoration: none;
	}
	.dup-primary {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 15px;
		font-weight: 500;
	}
	.dup-sep {
		color: var(--ink-mute);
		font-size: 13px;
	}
	.dup-secondary {
		color: var(--ink-soft);
		font-size: 13px;
		min-width: 0;
		word-break: break-word;
	}
	.dup-spinner {
		animation: dup-spin 720ms linear infinite;
		border: 2px solid color-mix(in oklch, var(--accent) 24%, transparent);
		border-radius: 999px;
		border-top-color: var(--accent);
		display: inline-block;
		height: 12px;
		width: 12px;
	}
	@keyframes dup-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
