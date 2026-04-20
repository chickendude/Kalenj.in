<script lang="ts">
	import { PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import type { PartOfSpeech } from '@prisma/client';

	type SearchResult = {
		id: string;
		kalenjin: string;
		translations: string;
		partOfSpeech: PartOfSpeech | null;
	};

	let { totalCount }: { totalCount: number } = $props();

	let query = $state('');
	let focused = $state(false);
	let hover = $state(0);
	let results = $state<SearchResult[]>([]);
	let inputEl: HTMLInputElement | undefined = $state();

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let fetchSeq = 0;

	$effect(() => {
		const q = query.trim();
		hover = 0;
		if (debounceTimer) clearTimeout(debounceTimer);

		if (!q) {
			results = [];
			return;
		}

		debounceTimer = setTimeout(async () => {
			const seq = ++fetchSeq;
			try {
				const response = await fetch(`/dictionary/search?q=${encodeURIComponent(q)}`);
				if (!response.ok) return;
				const data = (await response.json()) as { results: SearchResult[] };
				if (seq === fetchSeq) {
					results = data.results;
				}
			} catch {
				if (seq === fetchSeq) results = [];
			}
		}, 120);
	});

	function go(word: SearchResult | undefined) {
		if (!word) return;
		window.location.href = `/dictionary/${word.id}`;
	}

	function onKeyDown(event: KeyboardEvent) {
		if (results.length === 0) {
			if (event.key === 'Enter' && query.trim()) {
				window.location.href = `/dictionary?q=${encodeURIComponent(query.trim())}`;
			}
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			hover = Math.min(hover + 1, results.length - 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			hover = Math.max(hover - 1, 0);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			go(results[hover]);
		} else if (event.key === 'Escape') {
			query = '';
			inputEl?.blur();
		}
	}

	function onBlur() {
		setTimeout(() => (focused = false), 150);
	}

	const showMenu = $derived(focused && query.trim().length > 0);
</script>

<div class="home-search" class:open={showMenu}>
	<div class="home-search-field">
		<span class="home-search-icn" aria-hidden="true">
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
				<circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.5" />
				<path d="M9 9l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		</span>
		<input
			bind:this={inputEl}
			class="home-search-input"
			type="text"
			role="combobox"
			placeholder="Search the dictionary — Kalenjin or English"
			bind:value={query}
			onfocus={() => (focused = true)}
			onblur={onBlur}
			onkeydown={onKeyDown}
			aria-label="Search the dictionary"
			aria-autocomplete="list"
			aria-controls="home-search-menu"
			aria-expanded={showMenu}
		/>
		{#if query.trim()}
			<span class="home-search-hint mono">
				{results.length} match{results.length === 1 ? '' : 'es'}
			</span>
		{/if}
	</div>
	{#if showMenu}
		<div id="home-search-menu" class="home-search-menu" role="listbox">
			{#if results.length === 0}
				<div class="home-search-empty">
					No entries match &ldquo;{query.trim()}&rdquo;.
					<a href="/dictionary?q={encodeURIComponent(query.trim())}" style="margin-left: 8px"
						>Browse all →</a
					>
				</div>
			{:else}
				{#each results as word, i (word.id)}
					<a
						href={`/dictionary/${word.id}`}
						class="home-search-row"
						class:hover={i === hover}
						role="option"
						aria-selected={i === hover}
						onmouseenter={() => (hover = i)}
						onmousedown={(event) => event.preventDefault()}
					>
						<span class="hs-word">{word.kalenjin}</span>
						<span class="hs-pos">
							{word.partOfSpeech ? PART_OF_SPEECH_LABELS[word.partOfSpeech] : ''}
						</span>
						<span class="hs-trans">{word.translations}</span>
					</a>
				{/each}
				<a href="/dictionary" class="home-search-all">
					<span>Browse all {totalCount.toLocaleString()} entries</span>
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
						<path
							d="M2 6h8M7 3l3 3-3 3"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</a>
			{/if}
		</div>
	{/if}
</div>
