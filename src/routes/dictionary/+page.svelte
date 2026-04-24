<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { applyAction, enhance } from '$app/forms';
	import { page } from '$app/state';
	import PartOfSpeechInline from '$lib/components/PartOfSpeechInline.svelte';
	import { PART_OF_SPEECH_LABELS as POS_LABELS } from '$lib/parts-of-speech';
	import { stripWordLinks } from '$lib/word-links';
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import LemmaFormFields from '$lib/components/LemmaFormFields.svelte';
	import ImageUploadField from '$lib/components/ImageUploadField.svelte';
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
	const initialFiltersOpen = untrack(
		() => data.language !== 'kalenjin' || Boolean(data.pos) || Boolean(data.missing)
	);
	let searchQuery = $state(initialQuery);
	let filtersOpen = $state(initialFiltersOpen);
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
		if (data.language !== 'kalenjin' || Boolean(data.pos) || Boolean(data.missing)) {
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
	let addWordError = $state<string | null>(null);
	let addWordSubmitting = $state(false);
	let addWordKalenjin = $state('');
	let addWordTranslations = $state('');
	let addWordAlternativeSpellings = $state('');
	let addWordNotes = $state('');
	let addWordPartOfSpeech = $state<PartOfSpeech | ''>('');
	let addWordPluralForm = $state('');
	let addWordIsPluralOnly = $state(false);
	let addWordAlternativePluralForms = $state('');
	let addWordPresentAnee = $state('');
	let addWordPresentInyee = $state('');
	let addWordPresentInee = $state('');
	let addWordPresentEchek = $state('');
	let addWordPresentOkwek = $state('');
	let addWordPresentIchek = $state('');
	let addWordKalenjinInput = $state<HTMLInputElement | null>(null);

	function resetAddWordForm() {
		addWordKalenjin = '';
		addWordTranslations = '';
		addWordAlternativeSpellings = '';
		addWordNotes = '';
		addWordPartOfSpeech = '';
		addWordPluralForm = '';
		addWordIsPluralOnly = false;
		addWordAlternativePluralForms = '';
		addWordPresentAnee = '';
		addWordPresentInyee = '';
		addWordPresentInee = '';
		addWordPresentEchek = '';
		addWordPresentOkwek = '';
		addWordPresentIchek = '';
		addWordError = null;
	}

	function openAddWord() {
		resetAddWordForm();
		addWordOpen = true;
	}

	function closeAddWord() {
		if (addWordSubmitting) return;
		addWordOpen = false;
	}

	function handleAddWordKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeAddWord();
		}
	}

	function handleAddWordBackdrop(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closeAddWord();
		}
	}

	$effect(() => {
		if (!addWordOpen) return;
		const timeout = window.setTimeout(() => addWordKalenjinInput?.focus(), 0);
		return () => window.clearTimeout(timeout);
	});
</script>

<svelte:head>
	<title>Dictionary — Kalenj.in</title>
</svelte:head>

<section>
	<div class="page-head">
		<div>
			<div class="page-kicker">Kalenjin → English</div>
			<h1>Dictionary</h1>
			<p>
				This is our project to document the vocabulary used by native Kalenjin speakers today,
				with a focus on the Kipsigis dialect.
			</p>
		</div>
		<div class="page-stat">
			<b>{data.totalCount}</b>
			headwords indexed
		</div>
	</div>

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

			<div class="filter-toggle-wrap">
				<label class="filter-toggle-label" for="dictionary-filters">Options</label>
				<button
					id="dictionary-filters"
					type="button"
					class="btn-sm ghost filter-toggle"
					aria-expanded={filtersOpen}
					aria-controls="dictionary-filter-panel"
					onclick={() => (filtersOpen = !filtersOpen)}
				>
					Filter
				</button>
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
						class:active={data.language === 'kalenjin'}
						onclick={() => selectLanguage('kalenjin')}
					>Kalenjin</button>
					<button
						type="button"
						class:active={data.language === 'translations'}
						onclick={() => selectLanguage('translations')}
					>Translations</button>
					<button
						type="button"
						class:active={data.language === 'both'}
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
		{#if data.user}
			<button type="button" class="btn ghost" onclick={openAddWord}>+ Add new word</button>
		{/if}
	</div>

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
								</span>
							</div>
						</td>
						<td class="col-trans">{stripWordLinks(word.translations)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

{#if addWordOpen}
	<div
		class="add-word-backdrop"
		role="presentation"
		onclick={handleAddWordBackdrop}
		onkeydown={handleAddWordKeydown}
	>
		<div
			class="add-word-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="add-word-title"
		>
			<div class="add-word-head">
				<h2 id="add-word-title">Add dictionary word</h2>
				<button
					type="button"
					class="add-word-close"
					onclick={closeAddWord}
					aria-label="Close"
					disabled={addWordSubmitting}
				>×</button>
			</div>

			<form
				method="POST"
				action="?/createWord"
				class="add-word-form"
				enctype="multipart/form-data"
				use:enhance={() => {
					addWordSubmitting = true;
					addWordError = null;
					return async ({ result }) => {
						addWordSubmitting = false;
						if (result.type === 'redirect') {
							addWordOpen = false;
							await applyAction(result);
							return;
						}
						if (result.type === 'failure') {
							addWordError =
								(result.data?.error as string | undefined) ?? 'Could not create word.';
							return;
						}
						if (result.type === 'success') {
							addWordOpen = false;
							await invalidateAll();
						}
					};
				}}
			>
				{#if addWordError}
					<p class="add-word-error">{addWordError}</p>
				{/if}
				<LemmaFormFields
					bind:kalenjin={addWordKalenjin}
					bind:translations={addWordTranslations}
					bind:alternativeSpellings={addWordAlternativeSpellings}
					bind:notes={addWordNotes}
					bind:partOfSpeech={addWordPartOfSpeech}
					bind:pluralForm={addWordPluralForm}
					bind:isPluralOnly={addWordIsPluralOnly}
					bind:alternativePluralForms={addWordAlternativePluralForms}
					bind:presentAnee={addWordPresentAnee}
					bind:presentInyee={addWordPresentInyee}
					bind:presentInee={addWordPresentInee}
					bind:presentEchek={addWordPresentEchek}
					bind:presentOkwek={addWordPresentOkwek}
					bind:presentIchek={addWordPresentIchek}
					idPrefix="dict-add-word"
					kalenjinLabel="Kalenjin"
					alternativeSpellingsHint="comma, separated"
				/>
				<ImageUploadField name="image" idPrefix="dict-add-word-image" />
				<div class="add-word-actions">
					<button
						type="button"
						class="btn ghost"
						onclick={closeAddWord}
						disabled={addWordSubmitting}>Cancel</button>
					<button type="submit" class="btn" disabled={addWordSubmitting}>
						{addWordSubmitting ? 'Creating…' : 'Create word'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.add-word-backdrop {
		align-items: flex-start;
		background: rgba(15, 23, 42, 0.35);
		display: flex;
		inset: 0;
		justify-content: center;
		overflow-y: auto;
		padding: 3rem 1rem;
		position: fixed;
		z-index: 60;
	}

	.add-word-dialog {
		background: var(--bg-raised, var(--paper));
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: 0 20px 45px rgba(15, 23, 42, 0.25);
		display: grid;
		gap: 1rem;
		max-width: 640px;
		padding: 1.25rem 1.5rem 1.5rem;
		width: 100%;
	}

	.add-word-head {
		align-items: center;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	.add-word-head h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.add-word-close {
		background: transparent;
		border: 0;
		color: var(--ink-soft, #334155);
		cursor: pointer;
		font-size: 1.5rem;
		line-height: 1;
		padding: 0.25rem 0.5rem;
	}
	.add-word-close:hover:not(:disabled) {
		color: var(--ink, #0f172a);
	}
	.add-word-close:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.add-word-form {
		display: grid;
		gap: 0.75rem;
	}

	.add-word-error {
		background: color-mix(in oklch, var(--danger) 12%, transparent);
		border: 1px solid color-mix(in oklch, var(--danger) 40%, transparent);
		border-radius: 8px;
		color: var(--danger);
		font-weight: 500;
		margin: 0;
		padding: 8px 12px;
	}

	.add-word-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
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

	.filter-toggle-wrap {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: flex-start;
	}

	.filter-toggle-label {
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-mute);
		font-weight: 600;
	}

	.filter-toggle {
		min-height: 45px;
		padding-inline: 14px;
		white-space: nowrap;
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

		.filter-field-language,
		.filter-field-missing,
		.filter-field-pos {
			flex: initial;
		}

		.filter-toggle {
			width: 100%;
			justify-content: center;
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
