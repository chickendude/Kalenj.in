<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page, navigating } from '$app/state';
	import {
		normalizeBulkSentenceForReview,
		type BulkSentenceReviewRow,
		type BulkSentenceWarning
	} from '$lib/bulk-sentences';
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';
	import DuplicateSuggestions from '$lib/components/DuplicateSuggestions.svelte';

	let { data, form } = $props();

	type ReviewRow = BulkSentenceReviewRow & { removed?: boolean };

	const canEdit = $derived(
		data.user?.role === 'ADMIN' || data.user?.role === 'MANAGER'
	);
	const canBulkImport = $derived(data.user?.role === 'ADMIN');

	let composeOpen = $state(false);
	let composeTab = $state<'single' | 'bulk'>('single');
	let composeKalenjin = $state(untrack(() => form?.values?.kalenjin ?? ''));
	let composeEnglish = $state(untrack(() => form?.values?.english ?? ''));
	let composeNotes = $state(untrack(() => form?.values?.notes ?? ''));
	let bulkText = $state(untrack(() => form?.bulkValues?.bulkText ?? ''));
	let bulkReviewRows = $state<ReviewRow[]>([]);

	$effect(() => {
		const values = form?.values;
		untrack(() => {
			if (values) {
				composeKalenjin = String(values.kalenjin ?? '');
				composeEnglish = String(values.english ?? '');
				composeNotes = String(values.notes ?? '');
			}
		});
	});

	const composeDuplicateQuery = $derived(composeKalenjin.trim());
	const activeBulkRows = $derived(bulkReviewRows.filter((row) => !row.removed));
	const removedBulkCount = $derived(bulkReviewRows.length - activeBulkRows.length);
	const bulkReviewRowsJson = $derived(
		JSON.stringify(
			activeBulkRows.map((row) => ({
				lineNumber: row.lineNumber,
				kalenjin: row.kalenjin,
				english: row.english
			}))
		)
	);
	const reviewingBulk = $derived(canBulkImport && composeTab === 'bulk' && bulkReviewRows.length > 0);
	function toggleCompose() {
		composeOpen = !composeOpen;
	}
	function selectComposeTab(tab: 'single' | 'bulk') {
		composeTab = tab;
		composeOpen = true;
	}

	$effect(() => {
		if (!canBulkImport && composeTab === 'bulk') {
			composeTab = 'single';
			bulkReviewRows = [];
		}
		if (form?.bulkError || form?.bulkSuccess) {
			composeTab = 'bulk';
			composeOpen = true;
			if (form?.bulkSuccess) bulkReviewRows = [];
		} else if (form?.error) {
			composeTab = 'single';
			composeOpen = true;
		}
		if (form?.bulkReviewRows) {
			bulkReviewRows = form.bulkReviewRows;
			composeTab = 'bulk';
			composeOpen = true;
		}
	});

	function updateBulkRow(index: number, field: 'kalenjin' | 'english', value: string) {
		bulkReviewRows = bulkReviewRows.map((row, i) =>
			i === index ? { ...row, [field]: value } : row
		);
	}

	function normalizeBulkRow(index: number) {
		bulkReviewRows = bulkReviewRows.map((row, i) =>
			i === index
				? normalizeBulkSentenceForReview({
						lineNumber: row.lineNumber,
						kalenjin: row.kalenjin,
						english: row.english
					})
				: row
		);
	}

	function lowercaseWarningWord(
		index: number,
		field: BulkSentenceWarning['field'],
		word: string
	) {
		bulkReviewRows = bulkReviewRows.map((row, i) => {
			if (i !== index) return row;
			const parts = row[field].split(/(\s+)/);
			let wordIndex = -1;
			const nextValue = parts
				.map((part) => {
					if (!part.trim()) return part;
					wordIndex += 1;
					if (wordIndex === 0) return part;

					const leading = part.match(/^\P{L}*/u)?.[0] ?? '';
					const trailing = part.match(/\P{L}*$/u)?.[0] ?? '';
					const core = part.slice(leading.length, part.length - trailing.length);
					if (core !== word) return part;

					return `${leading}${core.toLocaleLowerCase()}${trailing}`;
				})
				.join('');

			return normalizeBulkSentenceForReview({
				lineNumber: row.lineNumber,
				kalenjin: field === 'kalenjin' ? nextValue : row.kalenjin,
				english: field === 'english' ? nextValue : row.english
			});
		});
	}

	function toggleRemoveBulkRow(index: number) {
		bulkReviewRows = bulkReviewRows.map((row, i) =>
			i === index ? { ...row, removed: !row.removed } : row
		);
	}

	function resetBulkReview() {
		bulkText = activeBulkRows.map((row) => `${row.kalenjin}\t${row.english}`).join('\n');
		bulkReviewRows = [];
	}

	function warningsFor(row: BulkSentenceReviewRow, field: BulkSentenceWarning['field']) {
		return row.warnings.filter((warning) => warning.field === field);
	}

	const initialQuery = untrack(() => data.query);
	// While a navigation is in flight, reflect the language the user is heading to
	// so the toggle highlights instantly instead of waiting for the server load.
	const pendingLang = $derived(
		navigating?.to?.url.pathname === '/corpus'
			? navigating.to.url.searchParams.get('lang')
			: null
	);
	const activeLang = $derived(pendingLang ?? data.language);
	const isSearching = $derived(navigating?.to?.url.pathname === '/corpus');
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
					<a class="btn ghost sm" href="/corpus/record-audio">Record missing audio →</a>
					<a class="btn ghost sm" href="/corpus/duplicates">Check duplicates</a>
				</div>
			{/if}
		</div>
	</div>

	{#if form?.error}
		<p class="error-banner">{form.error}</p>
	{/if}

	<div class="corpus-layout" class:single={!canEdit} class:bulk-reviewing={reviewingBulk}>
		{#if canEdit}
			<div
				class="compose-card"
				class:closed={!composeOpen}
			>
				<div class="compose-head">
					<div
						class="compose-tabs"
						class:single-tab={!canBulkImport}
						role="tablist"
						aria-label="Sentence entry mode"
					>
						<button
							type="button"
							role="tab"
							class:active={composeTab === 'single'}
							aria-selected={composeTab === 'single'}
							aria-controls="single-sentence-panel"
							onclick={() => selectComposeTab('single')}
						>Add a sentence</button>
						{#if canBulkImport}
							<button
								type="button"
								role="tab"
								class:active={composeTab === 'bulk'}
								aria-selected={composeTab === 'bulk'}
								aria-controls="bulk-sentence-panel"
								onclick={() => selectComposeTab('bulk')}
							>Bulk import</button>
						{/if}
					</div>
					<button
						type="button"
						class="compose-collapse"
						aria-expanded={composeOpen}
						aria-controls="compose-body"
						aria-label={composeOpen ? 'Collapse sentence form' : 'Expand sentence form'}
						onclick={toggleCompose}
					>
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
				</div>
				<div id="compose-body" class="compose-body">

					{#if composeTab === 'single'}
						<div id="single-sentence-panel" role="tabpanel">
							<form method="POST" action="?/createSentence">
								<div class="field">
									<label for="compose-kalenjin">Kalenjin sentence *</label>
									<textarea
										id="compose-kalenjin"
										name="kalenjin"
										class="textarea"
										rows="3"
										required
										placeholder="Chamgei!"
										autocomplete="off"
										bind:value={composeKalenjin}
									></textarea>
								</div>

								<div class="field">
									<label for="compose-english">English translation *</label>
									<textarea
										id="compose-english"
										name="english"
										class="textarea"
										rows="3"
										required
										placeholder="Hello!"
										autocomplete="off"
										bind:value={composeEnglish}
									></textarea>
								</div>

								<div class="field">
									<label for="compose-notes">Notes (optional)</label>
									<input
										id="compose-notes"
										name="notes"
										class="input"
										placeholder="Context, usage, idiomatic meaning..."
										autocomplete="off"
										bind:value={composeNotes}
									/>
								</div>

								<DuplicateSuggestions
									searchEndpoint="/corpus/search"
									query={composeDuplicateQuery}
									linkBase="/corpus/"
									primaryKey="kalenjin"
									secondaryKey="english"
									label="Possible matching sentences"
									minQueryLength={3}
								/>

								<div class="form-actions">
									<button type="submit" class="btn">Create &amp; map tokens</button>
								</div>
							</form>
						</div>
					{:else}
						<div id="bulk-sentence-panel" role="tabpanel">
							{#if bulkReviewRows.length === 0}
								<form method="POST" action="?/previewBulkSentences" class="bulk-form">
									<div class="field">
										<label for="bulk-sentences">Sentence pairs (tab or " – ")</label>
										<textarea
											id="bulk-sentences"
											name="bulkText"
											class="textarea"
											rows="10"
											placeholder={'Labat kaa.\tRun home.\nLabat boisyet. – Run to work.'}
											bind:value={bulkText}
										></textarea>
									</div>

									{#if form?.bulkError}
										<p class="inline-error">{form.bulkError}</p>
									{/if}
									{#if form?.bulkSuccess}
										<p class="inline-success">
											Created {form.createdCount} sentence{form.createdCount === 1 ? '' : 's'}{form.skippedCount
												? `; skipped ${form.skippedCount} duplicate${form.skippedCount === 1 ? '' : 's'}`
												: ''}.
										</p>
									{/if}

									<div class="form-actions">
										<button type="submit" class="btn">Review import</button>
									</div>
								</form>
							{:else}
								<form method="POST" action="?/saveBulkSentences" class="bulk-review-form">
									<input type="hidden" name="reviewRows" value={bulkReviewRowsJson} />
									<div class="bulk-review-head">
										<div>
											<div class="review-title">Review {activeBulkRows.length} sentence{activeBulkRows.length === 1 ? '' : 's'}</div>
											<div class="review-meta">
												Edit rows here, then save once.{removedBulkCount
													? ` ${removedBulkCount} removed.`
													: ''}
											</div>
										</div>
										<button type="button" class="btn ghost sm" onclick={resetBulkReview}>Start over</button>
									</div>

									{#if form?.bulkSaveError}
										<p class="inline-error">{form.bulkSaveError}</p>
									{/if}

									<div class="bulk-review-table-wrap">
										<table class="bulk-review-table">
											<thead>
												<tr>
													<th class="row-action-col"><span class="sr-only">Actions</span></th>
													<th>Kalenjin</th>
													<th>English</th>
												</tr>
											</thead>
											<tbody>
												{#each bulkReviewRows as row, i (row.lineNumber)}
													<tr
														class:needs-review={!row.removed && row.warnings.length > 0}
														class:removed={row.removed}
													>
														<td class="row-action">
															<button
																type="button"
																class="row-remove-btn"
																class:is-removed={row.removed}
																onclick={() => toggleRemoveBulkRow(i)}
																title={row.removed ? 'Restore sentence' : 'Remove sentence'}
																aria-label={row.removed ? 'Restore sentence' : 'Remove sentence'}
															>
																{#if row.removed}
																	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
																		<path d="M3 7v6h6" />
																		<path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
																	</svg>
																{:else}
																	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
																		<line x1="6" y1="12" x2="18" y2="12" />
																	</svg>
																{/if}
															</button>
														</td>
														<td>
															<input
																aria-label="Kalenjin sentence"
																class="review-input"
																class:has-warning={!row.removed && warningsFor(row, 'kalenjin').length > 0}
																type="text"
																value={row.kalenjin}
																disabled={row.removed}
																oninput={(event) =>
																	updateBulkRow(i, 'kalenjin', (event.currentTarget as HTMLInputElement).value)}
																onblur={() => normalizeBulkRow(i)}
															/>
															{#if !row.removed && warningsFor(row, 'kalenjin').length > 0}
																<div class="field-warnings">
																	{#each warningsFor(row, 'kalenjin') as warning}
																		<span class="field-warning">
																			{warning.message}
																			{#each warning.words ?? [] as word}
																				<button
																					type="button"
																					class="trouble-word"
																					onclick={() => lowercaseWarningWord(i, warning.field, word)}
																					title={`Lowercase ${word}`}
																				>{word}</button>
																			{/each}
																		</span>
																	{/each}
																</div>
															{/if}
														</td>
														<td>
															<input
																aria-label="English translation"
																class="review-input"
																class:has-warning={!row.removed && warningsFor(row, 'english').length > 0}
																type="text"
																value={row.english}
																disabled={row.removed}
																oninput={(event) =>
																	updateBulkRow(i, 'english', (event.currentTarget as HTMLInputElement).value)}
																onblur={() => normalizeBulkRow(i)}
															/>
															{#if !row.removed && warningsFor(row, 'english').length > 0}
																<div class="field-warnings">
																	{#each warningsFor(row, 'english') as warning}
																		<span class="field-warning">{warning.message}</span>
																	{/each}
																</div>
															{/if}
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>

									<div class="form-actions">
										<button type="submit" class="btn" disabled={activeBulkRows.length === 0}>Save reviewed sentences</button>
									</div>
								</form>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if !reviewingBulk}
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
							class:active={activeLang === 'kalenjin'}
							onclick={() => selectLanguage('kalenjin')}
						>Kalenjin</button>
						<button
							type="button"
							class:active={activeLang === 'english'}
							onclick={() => selectLanguage('english')}
						>English</button>
						<button
							type="button"
							class:active={activeLang === 'both'}
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

			<div class="results-region" class:loading={isSearching} aria-busy={isSearching}>
			{#if data.sentences.length === 0}
				<div class="empty">
					{data.query ? 'No sentences match your search.' : 'No sentences yet.'}
				</div>
			{:else}
				<ul class="sentence-list">
					{#each data.sentences as sentence (sentence.id)}
						<li>
							<div class="sentence-row sentence-card">
								<div class="kal">
									<TokenHoverPreview
										sentenceId={sentence.id}
										sentenceText={sentence.kalenjin}
										tokens={sentence.tokens}
									>
										{#snippet leading()}
											<AudioPlayButton
												audioUrl={sentence.audioUrl}
												size="sm"
												label="Play sentence"
											/>
										{/snippet}
									</TokenHoverPreview>
								</div>
								<a class="en sentence-card-link" href={`/corpus/${sentence.id}`}>
									<SentenceTimeText text={sentence.english} />
								</a>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
			</div>
		</section>
		{/if}
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
	.corpus-layout.bulk-reviewing {
		grid-template-columns: 1fr;
	}

	.compose-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		overflow: hidden;
		position: sticky;
		top: 96px;
	}
	.corpus-layout.bulk-reviewing .compose-card {
		position: static;
	}
	.compose-card .field + .field {
		margin-top: 14px;
	}
	.compose-head {
		display: flex;
		align-items: flex-end;
		background: var(--bg);
		border-bottom: 1px solid var(--line);
	}
	.compose-tabs {
		display: grid;
		flex: 1;
		grid-template-columns: 1fr 1fr;
		margin-bottom: -1px;
	}
	.compose-tabs.single-tab {
		grid-template-columns: 1fr;
	}
	.compose-tabs button {
		background: color-mix(in oklch, var(--bg-raised) 55%, var(--bg));
		border: 1px solid var(--line);
		border-left: 0;
		border-bottom-color: var(--line);
		border-radius: 0;
		color: var(--ink-soft);
		cursor: pointer;
		font: inherit;
		font-size: 13px;
		min-height: 42px;
		padding: 9px 14px;
		position: relative;
	}
	.compose-tabs button:last-child {
		border-right: 0;
	}
	.compose-tabs button.active {
		background: var(--bg-raised);
		border-bottom-color: var(--bg-raised);
		color: var(--ink);
		font-weight: 600;
		z-index: 1;
	}
	.compose-body {
		padding: 24px;
	}
	.inline-error,
	.inline-success {
		border-radius: var(--radius);
		font-size: 13px;
		margin: 12px 0 0;
		padding: 8px 10px;
	}
	.inline-error {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.inline-success {
		background: var(--success-soft);
		color: var(--success);
	}
	.bulk-review-head {
		display: flex;
		gap: 12px;
		justify-content: space-between;
		margin-bottom: 14px;
	}
	.review-title {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 18px;
		line-height: 1.2;
	}
	.review-meta {
		color: var(--ink-mute);
		font-size: 12px;
		margin-top: 3px;
	}
	.bulk-review-table-wrap {
		max-height: 58vh;
		overflow: auto;
	}
	.corpus-layout.bulk-reviewing .bulk-review-table-wrap {
		max-height: none;
	}
	.bulk-review-table {
		border-collapse: collapse;
		table-layout: fixed;
		width: 100%;
	}
	.bulk-review-table th {
		color: var(--ink-soft);
		font-size: 12px;
		font-weight: 600;
		padding: 0 6px 8px;
		text-align: left;
	}
	.bulk-review-table td {
		border-top: 1px solid var(--line-soft);
		padding: 10px 6px;
		vertical-align: top;
	}
	.bulk-review-table tbody tr:first-child td {
		border-top: 0;
	}
	.bulk-review-table tr.needs-review td {
		border-top-color: color-mix(in oklch, var(--brand) 30%, var(--line-soft));
	}
	.review-input {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: none;
		color: var(--ink);
		font: inherit;
		font-family: var(--font-display);
		font-size: 15px;
		line-height: 1.35;
		min-height: 42px;
		outline: none;
		padding: 9px 11px;
		transition: border-color 0.15s, box-shadow 0.15s;
		width: 100%;
	}
	.review-input:focus {
		border-color: var(--brand);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand) 14%, transparent);
	}
	.review-input.has-warning {
		border-color: var(--danger);
		box-shadow: 0 0 0 2px color-mix(in oklch, var(--danger) 10%, transparent);
	}
	.review-input.has-warning:focus {
		border-color: var(--danger);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--danger) 16%, transparent);
	}
	.field-warnings {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 6px;
	}
	.field-warning {
		align-items: center;
		background: color-mix(in oklch, var(--danger) 8%, transparent);
		border: 1px solid color-mix(in oklch, var(--danger) 22%, transparent);
		border-radius: 999px;
		color: var(--danger);
		display: inline-flex;
		font-size: 12px;
		gap: 5px;
		line-height: 1.2;
		padding: 4px 8px;
	}
	.trouble-word {
		background: color-mix(in oklch, var(--danger) 18%, transparent);
		border: 0;
		border-radius: 999px;
		color: var(--danger);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 11px;
		line-height: 1.2;
		padding: 2px 6px;
	}
	.trouble-word:hover,
	.trouble-word:focus-visible {
		background: color-mix(in oklch, var(--danger) 26%, transparent);
		outline: none;
	}
	.sr-only {
		height: 1px;
		margin: -1px;
		overflow: hidden;
		padding: 0;
		position: absolute;
		width: 1px;
	}
	.bulk-review-table th.row-action-col,
	.bulk-review-table td.row-action {
		width: 40px;
	}
	.bulk-review-table td.row-action {
		padding-right: 0;
		text-align: left;
	}
	.row-remove-btn {
		align-items: center;
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-soft);
		cursor: pointer;
		display: inline-flex;
		height: 30px;
		justify-content: center;
		margin-top: 6px;
		padding: 0;
		transition: border-color 0.15s, color 0.15s, background 0.15s;
		width: 30px;
	}
	.row-remove-btn:hover,
	.row-remove-btn:focus-visible {
		background: color-mix(in oklch, var(--danger) 10%, transparent);
		border-color: var(--danger);
		color: var(--danger);
		outline: none;
	}
	.row-remove-btn.is-removed {
		border-color: color-mix(in oklch, var(--brand) 45%, var(--line));
		color: var(--brand);
	}
	.row-remove-btn.is-removed:hover,
	.row-remove-btn.is-removed:focus-visible {
		background: color-mix(in oklch, var(--brand) 12%, transparent);
		border-color: var(--brand);
		color: var(--brand);
	}
	.bulk-review-table tr.removed .review-input {
		color: var(--ink-mute);
		opacity: 0.6;
		text-decoration: line-through;
	}
	.compose-collapse {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 0;
		border-bottom-color: var(--bg-raised);
		border-right: 0;
		color: var(--ink-soft);
		cursor: pointer;
		display: none;
		height: 38px;
		justify-content: center;
		margin-bottom: -1px;
		padding: 0;
		width: 38px;
	}
	.compose-caret {
		display: inline-flex;
		transition: transform 0.15s;
	}
	@media (max-width: 900px) {
		.compose-body {
			padding: 16px 18px;
		}
		.compose-tabs button {
			padding-inline: 10px;
		}
		.compose-collapse {
			display: inline-flex;
		}
		.bulk-review-table {
			min-width: 620px;
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

	.results-region {
		transition: opacity 0.15s ease;
	}
	.results-region.loading {
		opacity: 0.55;
	}

	.sentence-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.sentence-list li {
		border-bottom: 1px solid var(--line-soft);
	}
	.sentence-list li:last-child {
		border-bottom: 0;
	}
	.sentence-row {
		padding: 22px 0;
	}
	.sentence-row .kal {
		font-family: var(--font-display);
		font-size: 22px;
		line-height: 1.3;
		margin-bottom: 6px;
	}
	/* The play button is rendered as the first item inside the token preview's
	   wrapping flow, so wrapped lines stay flush-left (no hanging indent). */
	.sentence-row .kal :global(.sentence-preview) {
		align-items: center;
	}
	.sentence-row .en {
		color: var(--ink-soft);
		font-size: 15px;
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
		.sentence-row .kal {
			font-size: 19px;
		}
	}
</style>
