<script lang="ts">
	import { buildWordLinkInsertion, stripWordLinks } from '$lib/word-links';
	import { PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import type { PartOfSpeech } from '@prisma/client';

	type SearchResult = {
		id: string;
		kalenjin: string;
		translations: string;
		partOfSpeech: PartOfSpeech | null;
	};

	type Props = {
		id?: string;
		name: string;
		value?: string;
		placeholder?: string;
		required?: boolean;
		multiline?: boolean;
		rows?: number;
		className?: string;
	};

	let {
		id,
		name,
		value = $bindable(''),
		placeholder,
		required = false,
		multiline = false,
		rows = 3,
		className
	}: Props = $props();

	let el: HTMLInputElement | HTMLTextAreaElement | undefined = $state();
	let triggerStart: number | null = $state(null);
	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let hover = $state(0);
	let showMenu = $state(false);

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let fetchSeq = 0;

	function caretPos(): number {
		return el?.selectionStart ?? 0;
	}

	function closeMenu() {
		triggerStart = null;
		query = '';
		results = [];
		hover = 0;
		showMenu = false;
	}

	function openAt(index: number) {
		triggerStart = index;
		query = '';
		results = [];
		hover = 0;
		showMenu = true;
	}

	function updateQuery() {
		if (triggerStart === null || !el) return;
		const caret = caretPos();
		if (caret <= triggerStart) {
			closeMenu();
			return;
		}
		if (value[triggerStart] !== '[') {
			closeMenu();
			return;
		}
		const slice = value.slice(triggerStart + 1, caret);
		if (/[\]\n]/.test(slice)) {
			closeMenu();
			return;
		}
		query = slice;
		runSearch(query);
	}

	function runSearch(q: string) {
		if (debounceTimer) clearTimeout(debounceTimer);
		const trimmed = q.trim();
		if (!trimmed) {
			results = [];
			return;
		}
		debounceTimer = setTimeout(async () => {
			const seq = ++fetchSeq;
			try {
				const response = await fetch(`/dictionary/search?q=${encodeURIComponent(trimmed)}`);
				if (!response.ok) return;
				const data = (await response.json()) as { results: SearchResult[] };
				if (seq === fetchSeq) {
					results = data.results;
					hover = 0;
				}
			} catch {
				if (seq === fetchSeq) results = [];
			}
		}, 120);
	}

	function select(pick: SearchResult | undefined) {
		if (!pick || triggerStart === null || !el) return;
		const caret = caretPos();
		const { nextValue, nextCaret } = buildWordLinkInsertion(value, triggerStart, caret, pick);
		value = nextValue;
		closeMenu();
		const target = el;
		queueMicrotask(() => {
			target.focus();
			target.setSelectionRange(nextCaret, nextCaret);
		});
	}

	function onInput() {
		if (triggerStart === null && el) {
			const caret = caretPos();
			if (caret > 0 && value[caret - 1] === '[') {
				openAt(caret - 1);
			}
		}
		updateQuery();
	}

	function onKeyDown(event: KeyboardEvent) {
		if (!showMenu) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			closeMenu();
			return;
		}

		if (results.length === 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			hover = Math.min(hover + 1, results.length - 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			hover = Math.max(hover - 1, 0);
		} else if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			select(results[hover]);
		}
	}

	function onBlur() {
		setTimeout(() => closeMenu(), 150);
	}
</script>

<div class="wle-wrap">
	{#if multiline}
		<textarea
			bind:this={el}
			{id}
			{name}
			{placeholder}
			{required}
			{rows}
			class={className}
			bind:value
			oninput={onInput}
			onkeydown={onKeyDown}
			onkeyup={onInput}
			onclick={onInput}
			onblur={onBlur}
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={showMenu}
			aria-controls="wle-menu-{name}"
		></textarea>
	{:else}
		<input
			bind:this={el}
			{id}
			{name}
			{placeholder}
			{required}
			type="text"
			class={className}
			bind:value
			oninput={onInput}
			onkeydown={onKeyDown}
			onkeyup={onInput}
			onclick={onInput}
			onblur={onBlur}
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={showMenu}
			aria-controls="wle-menu-{name}"
		/>
	{/if}
	{#if showMenu && query.trim().length > 0}
		<div id="wle-menu-{name}" class="wle-menu" role="listbox">
			{#if results.length === 0}
				<div class="wle-empty">No matches for &ldquo;{query.trim()}&rdquo;</div>
			{:else}
				{#each results as word, i (word.id)}
					<button
						type="button"
						class="wle-row"
						class:hover={i === hover}
						role="option"
						aria-selected={i === hover}
						onmouseenter={() => (hover = i)}
						onmousedown={(event) => event.preventDefault()}
						onclick={() => select(word)}
					>
						<span class="wle-word">{word.kalenjin}</span>
						<span class="wle-pos"
							>{word.partOfSpeech ? PART_OF_SPEECH_LABELS[word.partOfSpeech] : ''}</span
						>
						<span class="wle-trans">{stripWordLinks(word.translations)}</span>
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<style>
	.wle-wrap {
		position: relative;
		display: block;
	}
	.wle-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		z-index: 20;
		background: var(--surface, #fff);
		border: 1px solid var(--border, rgba(0, 0, 0, 0.15));
		border-radius: 6px;
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
		max-height: 260px;
		overflow-y: auto;
	}
	.wle-empty {
		padding: 8px 10px;
		color: var(--muted, #666);
		font-size: 13px;
	}
	.wle-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 2fr);
		gap: 8px;
		align-items: baseline;
		width: 100%;
		text-align: left;
		padding: 6px 10px;
		border: 0;
		background: transparent;
		cursor: pointer;
		font: inherit;
		border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
	}
	.wle-row:last-child {
		border-bottom: 0;
	}
	.wle-row.hover,
	.wle-row:hover {
		background: var(--hover, rgba(0, 0, 0, 0.05));
	}
	.wle-word {
		font-weight: 600;
	}
	.wle-pos {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted, #666);
	}
	.wle-trans {
		color: var(--muted, #555);
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
