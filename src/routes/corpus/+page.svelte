<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';

	let { data, form } = $props();

	const canEdit = $derived(
		data.user?.role === 'ADMIN' || data.user?.role === 'MANAGER'
	);

	let composeOpen = $state(false);
	function toggleCompose() {
		composeOpen = !composeOpen;
	}

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

	function navigateTo(nextQuery: string, nextLanguage: string) {
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
		const search = params.toString();
		goto(`/corpus${search ? `?${search}` : ''}`, {
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
			navigateTo(value, data.language);
		}, 180);
	}

	function selectLanguage(nextLanguage: 'kalenjin' | 'english' | 'both') {
		navigateTo(searchQuery, nextLanguage);
	}
</script>

<svelte:head>
	<title>Corpus — Kalenj.in</title>
</svelte:head>

<section>
	<div class="page-head">
		<div>
			<div class="page-kicker">Sentence bank</div>
			<h1>Corpus</h1>
			<p>
				A collection of translated sentences in Kalenjin to see how vocabulary is used in
				context.
			</p>
		</div>
		<div class="page-stat">
			<b>{data.totalCount}</b>
			sentence{data.totalCount === 1 ? '' : 's'} collected
			{#if canEdit}
				<div class="page-stat-actions">
					<a class="btn ghost sm" href="/corpus/duplicates">Check duplicates</a>
				</div>
			{/if}
		</div>
	</div>

	{#if form?.error}
		<p class="error-banner">{form.error}</p>
	{/if}

	<div class="corpus-layout" class:single={!canEdit}>
		{#if canEdit}
			<form
				method="POST"
				action="?/createSentence"
				class="compose-card"
				class:closed={!composeOpen}
			>
				<button
					type="button"
					class="compose-toggle"
					aria-expanded={composeOpen}
					aria-controls="compose-body"
					onclick={toggleCompose}
				>
					<h2>Add a sentence</h2>
					<span class="compose-caret" aria-hidden="true">
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="m6 9 6 6 6-6" />
						</svg>
					</span>
				</button>
				<div id="compose-body" class="compose-body">
					<p>Link each Kalenjin token to a dictionary entry after you save.</p>

					<div class="field">
						<label for="compose-kalenjin">Kalenjin sentence *</label>
						<textarea
							id="compose-kalenjin"
							name="kalenjin"
							class="textarea"
							rows="3"
							required
							placeholder="Chamgei!">{form?.values?.kalenjin ?? ''}</textarea>
					</div>

					<div class="field">
						<label for="compose-english">English translation *</label>
						<textarea
							id="compose-english"
							name="english"
							class="textarea"
							rows="3"
							required
							placeholder="Hello!">{form?.values?.english ?? ''}</textarea>
					</div>

					<div class="field">
						<label for="compose-notes">Notes (optional)</label>
						<input
							id="compose-notes"
							name="notes"
							class="input"
							value={form?.values?.notes ?? ''}
							placeholder="Context, usage, idiomatic meaning…"
						/>
					</div>

					<div class="form-actions">
						<button type="submit" class="btn">Create &amp; map tokens</button>
					</div>
				</div>
			</form>
		{/if}

		<section class="corpus-main">
			<div class="controls">
				<div class="field" style="flex: 1">
					<label for="corpus-search">Search sentences</label>
					<input
						id="corpus-search"
						type="search"
						class="input"
						value={searchQuery}
						oninput={handleSearchInput}
						placeholder={data.language === 'english'
							? 'Search English…'
							: data.language === 'kalenjin'
								? 'Search Kalenjin…'
								: 'Search Kalenjin or English…'}
					/>
				</div>

				<div class="field">
					<label for="corpus-lang-kalenjin">Language</label>
					<div class="toggle-lang">
						<button
							id="corpus-lang-kalenjin"
							type="button"
							class:active={data.language === 'kalenjin'}
							onclick={() => selectLanguage('kalenjin')}
						>Kalenjin</button>
						<button
							type="button"
							class:active={data.language === 'english'}
							onclick={() => selectLanguage('english')}
						>English</button>
						<button
							type="button"
							class:active={data.language === 'both'}
							onclick={() => selectLanguage('both')}
						>Both</button>
					</div>
				</div>
			</div>

			<div class="result-meta">
				<div class="result-count">
					{data.sentences.length} of {data.totalCount} sentence{data.totalCount === 1 ? '' : 's'}
				</div>
			</div>

			{#if data.sentences.length === 0}
				<div class="empty">
					{data.query ? 'No sentences match your search.' : 'No sentences yet.'}
				</div>
			{:else}
				<ul class="sentence-list">
					{#each data.sentences as sentence (sentence.id)}
						{@const mappedCount = sentence.tokens.filter(
							(t) => t.word || t.segments?.some((s) => s.word)
						).length}
						<li class="sentence-row">
							<div class="sentence-row-body">
								<div class="kal">
									<TokenHoverPreview
										sentenceId={sentence.id}
										sentenceText={sentence.kalenjin}
										tokens={sentence.tokens}
									/>
								</div>
								<div class="en">{sentence.english}</div>
								<div class="meta">
									<span>
										{mappedCount} / {sentence._count.tokens} token{sentence._count.tokens === 1
											? ''
											: 's'} mapped
									</span>
									{#if sentence.notes}
										<span>·</span>
										<span>{sentence.notes}</span>
									{/if}
								</div>
							</div>
							<div class="actions">
								<a class="btn ghost sm" href={`/corpus/${sentence.id}`}>
									{canEdit ? 'Open mapping' : 'View'}
								</a>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</section>

<style>
	.page-stat-actions {
		margin-top: 8px;
	}

	.corpus-layout {
		display: grid;
		grid-template-columns: 380px 1fr;
		gap: 48px;
		align-items: start;
	}
	.corpus-layout.single {
		grid-template-columns: 1fr;
	}

	.compose-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 24px;
		position: sticky;
		top: 96px;
	}
	.compose-card h2 {
		margin: 0 0 4px;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 500;
	}
	.compose-card p {
		margin: 0 0 18px;
		color: var(--ink-soft);
		font-size: 13px;
	}
	.compose-card .field + .field {
		margin-top: 14px;
	}
	.compose-toggle {
		display: block;
		width: 100%;
		background: none;
		border: 0;
		padding: 0;
		margin: 0;
		color: inherit;
		cursor: default;
		text-align: left;
	}
	.compose-caret {
		display: none;
	}
	@media (max-width: 900px) {
		.compose-card {
			padding: 16px 18px;
		}
		.compose-toggle {
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
		}
		.compose-toggle h2 {
			margin: 0;
		}
		.compose-caret {
			display: inline-flex;
			color: var(--ink-soft);
			transition: transform 0.15s;
		}
		.compose-card:not(.closed) .compose-caret {
			transform: rotate(180deg);
		}
		.compose-card.closed .compose-body {
			display: none;
		}
		.compose-card:not(.closed) .compose-body {
			margin-top: 14px;
		}
	}

	.textarea {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		color: var(--ink);
		padding: 12px 14px;
		border-radius: var(--radius);
		font: inherit;
		font-size: 15px;
		font-family: var(--font-display);
		line-height: 1.5;
		resize: vertical;
		min-height: 88px;
		outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
		width: 100%;
	}
	.textarea:focus {
		border-color: var(--brand);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand) 18%, transparent);
	}

	.controls {
		margin-bottom: 10px;
	}

	.sentence-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.sentence-row {
		padding: 22px 0;
		border-bottom: 1px solid var(--line-soft);
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 24px;
		align-items: start;
	}
	.sentence-row:last-child {
		border-bottom: 0;
	}
	.sentence-row-body {
		min-width: 0;
	}
	.sentence-row .kal {
		font-family: var(--font-display);
		font-size: 22px;
		color: var(--ink);
		margin-bottom: 6px;
		line-height: 1.3;
	}
	.sentence-row .en {
		color: var(--ink-soft);
		font-size: 15px;
	}
	.sentence-row .meta {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--ink-mute);
		margin-top: 8px;
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.sentence-row .actions {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: flex-end;
	}

	@media (max-width: 900px) {
		.corpus-layout {
			grid-template-columns: 1fr;
		}
		.compose-card {
			position: static;
		}
	}

	@media (max-width: 720px) {
		.sentence-row {
			grid-template-columns: 1fr;
			gap: 12px;
		}
		.sentence-row .kal {
			font-size: 19px;
		}
		.sentence-row .actions {
			align-items: flex-start;
		}
	}
</style>
