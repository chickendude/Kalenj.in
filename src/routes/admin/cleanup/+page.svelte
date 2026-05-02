<script lang="ts">
	import { firstTranslation } from '$lib/translations';
	import { stripWordLinks } from '$lib/word-links';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
</script>

<svelte:head>
	<title>Cleanup · Admin</title>
</svelte:head>

<div class="page-head">
	<div>
		<div class="page-kicker">Admin</div>
		<h1>Cleanup</h1>
		<p>Records that need attention from contributors. Lists show up to {data.listLimit} most recent.</p>
	</div>
</div>

<section class="cleanup-section">
	<header class="cleanup-section-head">
		<div>
			<h2>Sentences with incomplete lemmatization</h2>
			<p>Corpus sentences with one or more tokens that are not yet linked to a lemma.</p>
		</div>
		<span class="cleanup-count">{data.incompleteSentences.total.toLocaleString()}</span>
	</header>

	{#if data.incompleteSentences.items.length === 0}
		<p class="cleanup-empty">All corpus sentences are fully lemmatized. 🎉</p>
	{:else}
		<div class="table-scroll">
			<table class="cleanup-table">
				<thead>
					<tr>
						<th>Sentence</th>
						<th>English</th>
						<th class="num">Unlinked</th>
						<th>Updated</th>
					</tr>
				</thead>
				<tbody>
					{#each data.incompleteSentences.items as item (item.id)}
						<tr>
							<td>
								<a href={`/corpus/${item.id}`} class="cleanup-link">{item.kalenjin}</a>
							</td>
							<td class="muted">{item.english}</td>
							<td class="num">
								{item.unlinkedTokens}<span class="frac">/{item.totalTokens}</span>
							</td>
							<td class="muted">{dateFmt.format(item.updatedAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if data.incompleteSentences.total > data.incompleteSentences.items.length}
			<p class="cleanup-truncated">
				Showing {data.incompleteSentences.items.length.toLocaleString()} of
				{data.incompleteSentences.total.toLocaleString()}.
			</p>
		{/if}
	{/if}
</section>

<section class="cleanup-section">
	<header class="cleanup-section-head">
		<div>
			<h2>Nouns and adjectives missing plurals</h2>
			<p>Lemmas marked as a noun or adjective with no plural form recorded.</p>
		</div>
		<span class="cleanup-count">{data.missingPlurals.total.toLocaleString()}</span>
	</header>

	{#if data.missingPlurals.items.length === 0}
		<p class="cleanup-empty">All nouns and adjectives have plurals (or are marked plural-only). 🎉</p>
	{:else}
		<div class="table-scroll">
			<table class="cleanup-table">
				<thead>
					<tr>
						<th>Headword</th>
						<th>Translation</th>
						<th>Part of speech</th>
						<th>Updated</th>
					</tr>
				</thead>
				<tbody>
					{#each data.missingPlurals.items as word (word.id)}
						<tr>
							<td>
								<a href={`/dictionary/${word.id}`} class="cleanup-link">{word.kalenjin}</a>
							</td>
							<td class="muted">
								{firstTranslation(stripWordLinks(word.translations))}
							</td>
							<td class="muted">{word.partOfSpeech?.toLowerCase() ?? '—'}</td>
							<td class="muted">{dateFmt.format(word.updatedAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if data.missingPlurals.total > data.missingPlurals.items.length}
			<p class="cleanup-truncated">
				Showing {data.missingPlurals.items.length.toLocaleString()} of
				{data.missingPlurals.total.toLocaleString()}.
			</p>
		{/if}
	{/if}
</section>

<style>
	.cleanup-section {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 18px 20px;
		margin-bottom: 24px;
	}
	.cleanup-section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 16px;
		padding-bottom: 14px;
		border-bottom: 1px solid var(--line-soft);
	}
	.cleanup-section-head h2 {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 500;
		margin: 0 0 4px;
	}
	.cleanup-section-head p {
		margin: 0;
		font-size: 13px;
		color: var(--ink-mute);
		max-width: 60ch;
	}
	.cleanup-count {
		font-family: var(--font-display);
		font-size: 28px;
		color: var(--accent);
		font-weight: 500;
		flex-shrink: 0;
	}
	.cleanup-empty {
		margin: 8px 0 0;
		color: var(--ink-mute);
		font-size: 14px;
		font-style: italic;
	}
	.cleanup-truncated {
		margin: 12px 0 0;
		font-size: 12px;
		color: var(--ink-mute);
		font-style: italic;
	}
	.table-scroll {
		overflow-x: auto;
	}
	.cleanup-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	.cleanup-table th,
	.cleanup-table td {
		text-align: left;
		padding: 8px 12px;
		border-bottom: 1px solid var(--line-soft);
		vertical-align: top;
	}
	.cleanup-table th {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-mute);
		font-weight: 600;
		background: var(--surface);
	}
	.cleanup-table tr:last-child td {
		border-bottom: 0;
	}
	.cleanup-table .muted {
		color: var(--ink-soft);
	}
	.cleanup-table .num {
		text-align: right;
		font-family: var(--font-mono);
		font-size: 13px;
		white-space: nowrap;
	}
	.cleanup-table .num .frac {
		color: var(--ink-mute);
	}
	.cleanup-link {
		color: var(--ink);
		text-decoration: none;
		font-weight: 500;
	}
	.cleanup-link:hover {
		color: var(--accent);
		text-decoration: underline;
	}
</style>
