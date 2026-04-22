<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { applyAction, enhance } from '$app/forms';
	import { page } from '$app/state';
	import { PART_OF_SPEECH_LABELS as POS_LABELS, PARTS_OF_SPEECH } from '$lib/parts-of-speech';
	import { stripWordLinks } from '$lib/word-links';
	import LemmaFormFields from '$lib/components/LemmaFormFields.svelte';
	import type { PartOfSpeech } from '@prisma/client';

	let { data, form } = $props();

	const initialQuery = untrack(() => data.query);
	let searchQuery = $state(initialQuery);
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

	function navigateTo(nextQuery: string, nextLanguage: string, nextPos: string) {
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
			navigateTo(value, data.language, data.pos);
		}, 180);
	}

	function selectLanguage(nextLanguage: 'kalenjin' | 'translations' | 'both') {
		navigateTo(searchQuery, nextLanguage, data.pos);
	}

	function handlePosChange(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		navigateTo(searchQuery, data.language, value);
	}

	let addWordOpen = $state(false);
	let addWordError = $state<string | null>(null);
	let addWordSubmitting = $state(false);
	let addWordKalenjin = $state('');
	let addWordTranslations = $state('');
	let addWordAlternativeSpellings = $state('');
	let addWordNotes = $state('');
	let addWordPartOfSpeech = $state<PartOfSpeech | ''>('');
	let addWordPluralForm = $state('');
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
		<div class="field" style="flex: 1">
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

		<div class="field">
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

		<div class="field">
			<label for="pos">Part of speech</label>
			<select id="pos" class="select" onchange={handlePosChange}>
				<option value="" selected={!data.pos}>All</option>
				{#each PARTS_OF_SPEECH as p}
					<option value={p} selected={data.pos === p}>{POS_LABELS[p]}</option>
				{/each}
			</select>
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
					<th class="col-pos">Part of speech</th>
				</tr>
			</thead>
			<tbody>
				{#each data.words as word}
					<tr onclick={() => window.location.href = `/dictionary/${word.id}`} style="cursor: pointer">
						<td class="col-word">
							<a href={`/dictionary/${word.id}`}>{word.kalenjin}</a>
						</td>
						<td class="col-trans">{stripWordLinks(word.translations)}</td>
						<td class="col-pos">
							{#if word.partOfSpeech}
								<span class="pos-chip">{POS_LABELS[word.partOfSpeech]}</span>
							{:else}
								<span style="color: var(--ink-mute)">—</span>
							{/if}
						</td>
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
</style>
