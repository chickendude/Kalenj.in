<script lang="ts">
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
</script>

<svelte:head>
	<title>Dictionary — Kalenj.in</title>
</svelte:head>

<main class="shell">
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

	<form method="GET" class="controls">
		<div class="field" style="flex: 1">
			<label for="q">Search</label>
			<input
				id="q"
				name="q"
				class="input"
				placeholder={data.language === 'english' ? 'Search English…' : 'Search Kalenjin…'}
				value={data.query}
			/>
		</div>

		<div class="field">
			<label>Language</label>
			<div class="toggle-lang">
				<button
					type="submit"
					name="lang"
					value="kalenjin"
					class:active={data.language === 'kalenjin'}
				>Kalenjin</button>
				<button
					type="submit"
					name="lang"
					value="english"
					class:active={data.language === 'english'}
				>English</button>
			</div>
		</div>

		<div class="field">
			<label for="pos">Part of speech</label>
			<select id="pos" name="pos" class="select" onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit()}>
				<option value="" selected={!data.pos}>All</option>
				{#each PARTS_OF_SPEECH as p}
					<option value={p} selected={data.pos === p}>{POS_LABELS[p]}</option>
				{/each}
			</select>
		</div>
	</form>

	<div class="result-meta">
		<div class="result-count">{data.words.length} of {data.totalCount} entries</div>
		<a href="/dictionary/new" class="btn ghost">+ Add new word</a>
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
</main>
