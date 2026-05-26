<script lang="ts">
	import { goto } from '$app/navigation';
	import { PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import { stripWordLinks } from '$lib/word-links';
	import { dictionaryEntryHref } from '$lib/word-url';
	import type { PartOfSpeech } from '@prisma/client';

	type SearchResult = {
		id: string;
		kalenjin: string;
		slug?: string;
		href?: string;
		pluralForm: string | null;
		translations: string;
		partOfSpeech: PartOfSpeech | null;
	};

	let { canAddWord = false }: { canAddWord?: boolean } = $props();

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

	function dismiss() {
		focused = false;
		inputEl?.blur();
	}

	function go(word: SearchResult | undefined) {
		if (!word) return;
		dismiss();
		goto(word.href ?? dictionaryEntryHref(word));
	}

	function browseAll() {
		const q = query.trim();
		if (!q) return;
		dismiss();
		goto(`/dictionary?q=${encodeURIComponent(q)}`);
	}

	function addWord() {
		const q = query.trim();
		dismiss();
		goto(`/dictionary?q=${encodeURIComponent(q)}&add=1`);
	}

	function onKeyDown(event: KeyboardEvent) {
		if (results.length === 0) {
			if (event.key === 'Enter' && query.trim()) {
				event.preventDefault();
				browseAll();
			} else if (event.key === 'Escape') {
				query = '';
				inputEl?.blur();
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

<div class="nav-search" class:open={showMenu}>
	<div class="nav-search-field">
		<span class="nav-search-icn" aria-hidden="true">
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
				<circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.5" />
				<path d="M9 9l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		</span>
		<input
			bind:this={inputEl}
			class="nav-search-input"
			type="text"
			role="combobox"
			placeholder="Search the dictionary…"
			bind:value={query}
			onfocus={() => (focused = true)}
			onblur={onBlur}
			onkeydown={onKeyDown}
			aria-label="Search the dictionary"
			aria-autocomplete="list"
			aria-controls="nav-search-menu"
			aria-expanded={showMenu}
		/>
	</div>
	{#if showMenu}
		<div id="nav-search-menu" class="nav-search-menu" role="listbox">
			{#if results.length === 0}
				<div class="nav-search-empty">No entries match &ldquo;{query.trim()}&rdquo;.</div>
			{:else}
				{#each results as word, i (word.id)}
					<a
						href={word.href ?? dictionaryEntryHref(word)}
						class="nav-search-row"
						class:hover={i === hover}
						role="option"
						aria-selected={i === hover}
						onmouseenter={() => (hover = i)}
						onmousedown={(event) => event.preventDefault()}
						onclick={dismiss}
					>
						<span class="ns-word"
							>{word.kalenjin}{#if word.pluralForm}<span class="ns-plural"
									>{' '}({word.pluralForm})</span
								>{/if}</span
						>
						<span class="ns-pos">
							{word.partOfSpeech ? PART_OF_SPEECH_LABELS[word.partOfSpeech] : ''}
						</span>
						<span class="ns-trans">{stripWordLinks(word.translations)}</span>
					</a>
				{/each}
				<button
					type="button"
					class="nav-search-all"
					onmousedown={(event) => event.preventDefault()}
					onclick={browseAll}
				>
					Browse all matches →
				</button>
			{/if}
			{#if canAddWord}
				<button
					type="button"
					class="nav-search-add"
					onmousedown={(event) => event.preventDefault()}
					onclick={addWord}
				>
					+ Add &ldquo;{query.trim()}&rdquo; as a new word
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.nav-search {
		position: relative;
		flex: 0 1 auto;
		min-width: 0;
		width: clamp(200px, 24vw, 340px);
	}
	.nav-search-field {
		display: flex;
		align-items: center;
		gap: 8px;
		border: 1px solid var(--line);
		background: var(--bg-raised);
		border-radius: var(--radius);
		padding: 4px 12px;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.nav-search.open .nav-search-field,
	.nav-search-field:focus-within {
		border-color: var(--brand);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand) 18%, transparent);
	}
	.nav-search.open .nav-search-field {
		border-radius: var(--radius) var(--radius) 0 0;
		box-shadow: none;
		border-bottom-color: transparent;
	}
	.nav-search-icn {
		color: var(--ink-mute);
		display: inline-flex;
	}
	.nav-search-input {
		flex: 1;
		border: 0;
		outline: 0;
		background: transparent;
		font-family: var(--font-body);
		font-size: 14px;
		color: var(--ink);
		padding: 8px 0;
		min-width: 0;
	}
	.nav-search-input::placeholder {
		color: var(--ink-mute);
	}
	.nav-search-menu {
		position: absolute;
		left: 0;
		right: 0;
		top: 100%;
		background: var(--bg-raised);
		border: 1px solid var(--brand);
		border-top: 1px solid var(--line-soft);
		border-radius: 0 0 var(--radius) var(--radius);
		box-shadow: 0 20px 40px -20px oklch(0.3 0.02 80 / 0.3);
		z-index: 30;
		overflow: hidden;
	}
	.nav-search-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 4px 12px;
		align-items: baseline;
		padding: 10px 14px;
		color: var(--ink);
		border-bottom: 1px solid var(--line-soft);
		text-decoration: none;
	}
	.nav-search-row:hover,
	.nav-search-row.hover {
		background: var(--accent-soft);
		text-decoration: none;
	}
	.ns-word {
		font-family: var(--font-display);
		font-size: 15px;
		font-weight: 500;
	}
	.ns-plural {
		color: var(--ink-mute);
		font-weight: 400;
		font-size: 13px;
	}
	.ns-pos {
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-mute);
		font-weight: 600;
		text-align: right;
	}
	.ns-trans {
		grid-column: 1 / -1;
		color: var(--ink-soft);
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.nav-search-empty {
		padding: 14px;
		color: var(--ink-mute);
		font-size: 13px;
	}
	.nav-search-all,
	.nav-search-add {
		display: block;
		width: 100%;
		border: 0;
		background: var(--surface);
		border-top: 1px dotted var(--line);
		color: var(--brand-ink);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-align: left;
		padding: 11px 14px;
		cursor: pointer;
	}
	.nav-search-all:hover,
	.nav-search-add:hover {
		background: var(--accent-soft);
	}
	.nav-search-add {
		color: var(--brand);
	}

	@media (max-width: 900px) {
		.nav-search {
			/* Take all remaining inline space so the input is usable */
			flex: 1 1 0;
			width: auto;
			min-width: 0;
			/* Drop position context so the dropdown anchors to the topbar instead */
			position: static;
		}
		.nav-search-input {
			font-size: 14px;
			padding: 10px 0;
		}
		/* Dropdown spans the topbar width rather than the cramped input */
		.nav-search-menu {
			left: 8px;
			right: 8px;
			top: 100%;
			border-radius: var(--radius);
			border-top: 1px solid var(--brand);
			margin-top: -1px;
		}
		/* Don't try to merge the field with the dropdown — they no longer share an edge */
		.nav-search.open .nav-search-field {
			border-radius: var(--radius);
			border-bottom-color: var(--brand);
			box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand) 18%, transparent);
		}
	}
</style>
