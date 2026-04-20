<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { PARTS_OF_SPEECH } from '$lib/parts-of-speech';
	import type { PartOfSpeech } from '@prisma/client';

	let { data } = $props();

	const POS_LABELS: Record<PartOfSpeech, string> = {
		NOUN: 'Noun',
		VERB: 'Verb',
		ADJECTIVE: 'Adjective',
		ADVERB: 'Adverb',
		PRONOUN: 'Pronoun',
		PREPOSITION: 'Preposition',
		CONJUNCTION: 'Conjunction',
		INTERJECTION: 'Interjection',
		PHRASE: 'Phrase',
		OTHER: 'Other'
	};

	let searchQuery = $state(data.query);
	let lastNavTarget = data.query;
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
</script>

<svelte:head>
	<title>Dictionary — Kalenj.in</title>
</svelte:head>

<section>
	<div class="page-head">
		<div>
			<div class="page-kicker">Kalenjin → English</div>
			<h1>Dictionary</h1>
			<p>A growing reference of everyday Kalenjin words, phrases, and forms — built with and for the community.</p>
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
			<a href="/dictionary/new" class="btn ghost">+ Add new word</a>
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
						<td class="col-trans">{word.translations}</td>
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
