<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page, navigating } from '$app/state';
	import PartOfSpeechInline from '$lib/components/PartOfSpeechInline.svelte';
	import { PART_OF_SPEECH_LABELS as POS_LABELS } from '$lib/parts-of-speech';
	import { stripWordLinks } from '$lib/word-links';
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import AddWordDialog from '$lib/components/AddWordDialog.svelte';
	import SwahiliLoanIndicator from '$lib/components/SwahiliLoanIndicator.svelte';
	import type { PartOfSpeech } from '@prisma/client';

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

	let { data, form } = $props();

	const initialQuery = untrack(() => data.query);
	// While a navigation is in flight, reflect the language the user is heading to
	// so the toggle highlights instantly instead of waiting for the server load.
	const pendingLang = $derived(
		navigating?.to?.url.pathname === '/dictionary'
			? navigating.to.url.searchParams.get('lang')
			: null
	);
	const activeLang = $derived(pendingLang ?? data.language);
	const isSearching = $derived(navigating?.to?.url.pathname === '/dictionary');
	const hasActiveFilters = $derived(
		data.language !== 'kalenjin' || Boolean(data.pos) || Boolean(data.missing)
	);
	const canEdit = $derived(data.user?.role === 'ADMIN' || data.user?.role === 'MANAGER');
	let searchQuery = $state(initialQuery);
	let filtersOpen = $state(untrack(() => hasActiveFilters));
	let lastNavTarget = initialQuery;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const nextQuery = data.query;
		untrack(() => {
			if (nextQuery !== lastNavTarget.trim()) {
				searchQuery = nextQuery;
				lastNavTarget = nextQuery;
			}
		});
	});

	$effect(() => {
		if (hasActiveFilters) {
			filtersOpen = true;
		}
	});

	function navigateTo(
		nextQuery: string,
		nextLanguage: string,
		nextPos: string,
		nextMissing: string
	) {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		lastNavTarget = nextQuery;
		const params = new URLSearchParams(page.url.searchParams);
		if (nextQuery) {
			params.set('q', nextQuery);
		} else {
			params.delete('q');
		}
		params.set('lang', nextLanguage);
		if (nextPos) {
			params.set('pos', nextPos);
		} else {
			params.delete('pos');
		}
		if (nextMissing) {
			params.set('missing', nextMissing);
		} else {
			params.delete('missing');
		}
		const search = params.toString();
		goto(`/dictionary${search ? `?${search}` : ''}`, {
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
			navigateTo(value, data.language, data.pos, data.missing);
		}, 180);
	}

	function selectLanguage(nextLanguage: 'kalenjin' | 'translations' | 'both') {
		navigateTo(searchQuery, nextLanguage, data.pos, data.missing);
	}

	function selectMissing(nextMissing: '' | 'plural' | 'conjugation') {
		navigateTo(searchQuery, data.language, data.pos, nextMissing);
	}

	let posOtherOpen = $state(false);
	let posOtherWrap = $state<HTMLDivElement | null>(null);

	const posOtherSelected = $derived(
		Boolean(data.pos) && (POS_OTHER as readonly string[]).includes(data.pos)
	);

	function selectPos(nextPos: string) {
		posOtherOpen = false;
		navigateTo(searchQuery, data.language, nextPos, data.missing);
	}

	function togglePosOther() {
		if (posOtherSelected) {
			selectPos('');
			return;
		}
		posOtherOpen = !posOtherOpen;
	}

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

	let addWordOpen = $state(false);
	let addWordInitial = $state<{ kalenjin?: string } | null>(null);

	function openAddWord(initial: { kalenjin?: string } | null = null) {
		addWordInitial = initial;
		addWordOpen = true;
	}

	let addParamHandled = false;
	$effect(() => {
		if (!page.url.searchParams.get('add') || addParamHandled) return;
		const role = page.data.user?.role;
		if (role !== 'ADMIN' && role !== 'MANAGER') return;
		addParamHandled = true;
		openAddWord({ kalenjin: untrack(() => data.query) });
		const params = new URLSearchParams(page.url.searchParams);
		params.delete('add');
		const search = params.toString();
		goto(`/dictionary${search ? `?${search}` : ''}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	});
</script>

<svelte:head>
	<title>Dictionary — Kalenj.in</title>
</svelte:head>

<section>
	<div class="controls">
		<div class="search-row">
			<div class="field search-field">
				<label for="q">Search</label>
				<input
					id="q"
					type="search"
					class="input"
					placeholder={data.language === 'translations' ? 'Search translations...' : 'Search Kalenjin...'}
					value={searchQuery}
					oninput={handleSearchInput}
				/>
			</div>

			<div class="search-actions">
				<button
					id="dictionary-filters"
					type="button"
					class="btn-sm ghost icon-btn filter-toggle"
					class:active={filtersOpen}
					aria-label="Filter"
					title="Filter"
					aria-expanded={filtersOpen}
					aria-controls="dictionary-filter-panel"
					onclick={() => (filtersOpen = !filtersOpen)}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
					</svg>
				</button>
				{#if canEdit}
					<button
						type="button"
						class="btn-sm ghost icon-btn"
						aria-label="Add new word"
						title="Add new word"
						onclick={() => openAddWord()}
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M12 5v14M5 12h14" />
						</svg>
					</button>
				{/if}
			</div>
		</div>

		<div
			id="dictionary-filter-panel"
			class="filters-panel"
			class:open={filtersOpen}
			hidden={!filtersOpen}
		>
			<div class="field filter-field-language">
				<label for="language-kalenjin">Language</label>
				<div class="toggle-lang">
					<button
						id="language-kalenjin"
						type="button"
						class:active={activeLang === 'kalenjin'}
						onclick={() => selectLanguage('kalenjin')}
					>Kalenjin</button>
					<button
						type="button"
						class:active={activeLang === 'translations'}
						onclick={() => selectLanguage('translations')}
					>Translations</button>
					<button
						type="button"
						class:active={activeLang === 'both'}
						onclick={() => selectLanguage('both')}
					>Both</button>
				</div>
			</div>

			<div class="field filter-field-missing">
				<span class="field-label">Missing</span>
				<div class="missing-filter" role="radiogroup" aria-label="Filter by missing data">
					<button
						type="button"
						role="radio"
						aria-checked={!data.missing}
						class="pos-pill"
						class:selected={!data.missing}
						onclick={() => selectMissing('')}
					>None</button>
					<button
						type="button"
						role="radio"
						aria-checked={data.missing === 'plural'}
						class="pos-pill"
						class:selected={data.missing === 'plural'}
						onclick={() => selectMissing('plural')}
					>Plural</button>
					<button
						type="button"
						role="radio"
						aria-checked={data.missing === 'conjugation'}
						class="pos-pill"
						class:selected={data.missing === 'conjugation'}
						onclick={() => selectMissing('conjugation')}
					>Conjugation</button>
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
					{#each POS_CORE as pos}
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
								{#each POS_OTHER as pos}
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
		<div class="result-count">{data.words.length} of {data.totalCount} entries</div>
		{#if page.data.user?.role === 'ADMIN' || page.data.user?.role === 'MANAGER'}
			<a class="record-missing-link" href="/admin/word-audio">Record missing audio →</a>
		{/if}
	</div>

	<div class="results-region" class:loading={isSearching} aria-busy={isSearching}>
	{#if data.words.length === 0}
		<div class="empty-state">No entries match — try a different search or clear filters.</div>
	{:else}
		<table class="dict-table">
			<thead>
				<tr>
					<th class="col-word">Kalenjin</th>
					<th class="col-trans">Translations (English)</th>
				</tr>
			</thead>
			<tbody>
				{#each data.words as word}
					<tr onclick={() => window.location.href = `/dictionary/${word.id}`} style="cursor: pointer">
						<td class="col-word">
							<div class="col-word-row">
								<AudioPlayButton
									audioUrl={word.audioUrl}
									size="sm"
									label={`Play pronunciation of ${word.kalenjin}`}
								/>
								<span class="word-with-pos">
									<a href={`/dictionary/${word.id}`}>{word.kalenjin}</a>
									{#if word.partOfSpeech}
										<PartOfSpeechInline value={word.partOfSpeech} size="tiny" />
									{/if}
									{#if word.isSwahiliLoan}
										<SwahiliLoanIndicator compact />
									{/if}
								</span>
							</div>
						</td>
						<td class="col-trans">{stripWordLinks(word.translations)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
	</div>
</section>

<AddWordDialog
	bind:open={addWordOpen}
	idPrefix="dict-add-word"
	initial={addWordInitial}
/>


<style>
	.record-missing-link {
		color: var(--accent);
		text-decoration: none;
		font-size: 13px;
	}
	.record-missing-link:hover {
		text-decoration: underline;
	}

	.controls {
		grid-template-columns: 1fr;
		align-items: stretch;
	}

	.search-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 12px;
		align-items: end;
	}

	.search-field {
		min-width: 0;
	}

	.search-actions {
		display: flex;
		gap: 8px;
		align-items: end;
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 45px;
		min-height: 45px;
		padding: 0;
		flex: 0 0 auto;
	}

	.filter-toggle.active {
		background: var(--surface);
		color: var(--ink);
		border-color: var(--brand);
	}

	.filters-panel {
		display: none;
		flex-wrap: wrap;
		gap: 10px;
		align-items: start;
		padding-top: 4px;
	}

	.filters-panel.open {
		display: flex;
	}

	.filter-field-language,
	.filter-field-missing {
		flex: 0 0 auto;
	}

	.filter-field-pos {
		flex: 1 1 24rem;
		min-width: 0;
	}

	.filters-panel .toggle-lang {
		display: inline-flex;
		width: fit-content;
		max-width: 100%;
	}

	.filters-panel .toggle-lang button {
		padding-inline: 12px;
	}

	.field-label {
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-mute);
		font-weight: 600;
	}

	.pos-filter,
	.missing-filter {
		display: flex;
		flex-wrap: nowrap;
		gap: 6px;
	}
	.pos-pill {
		flex: 0 0 auto;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 10px;
		color: var(--ink);
		cursor: pointer;
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
	.col-word-row {
		align-items: center;
		display: flex;
		gap: 10px;
	}

	.results-region {
		transition: opacity 0.15s ease;
	}
	.results-region.loading {
		opacity: 0.55;
	}

	@media (max-width: 720px) {
		.filters-panel.open {
			grid-template-columns: 1fr;
			display: grid;
		}

		.filter-field-language,
		.filter-field-missing,
		.filter-field-pos {
			flex: initial;
		}

		.toggle-lang {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			width: 100%;
		}

		.toggle-lang button {
			padding-inline: 10px;
		}
	}
</style>
