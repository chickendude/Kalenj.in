<script lang="ts">
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';
	import WordLinkEditor from '$lib/components/WordLinkEditor.svelte';
	import { PART_OF_SPEECH_LABELS, PARTS_OF_SPEECH } from '$lib/parts-of-speech';
	import { parseTranslationList } from '$lib/translations';
	import { renderWordLinks, stripWordLinks } from '$lib/word-links';
	import { renderMarkdown } from '$lib/markdown';
	import { toast } from '$lib/stores/toast.svelte';
	import { enhance } from '$app/forms';
	import type { PartOfSpeech } from '@prisma/client';

	let { data, form } = $props();

	type DictionarySearchResult = {
		id: string;
		kalenjin: string;
		translations: string;
		partOfSpeech: PartOfSpeech | null;
	};

	const POS_LABELS = PART_OF_SPEECH_LABELS;

	const values = $derived(form?.values ?? data.word);

	let kalenjinValue = $state('');
	let translationsValue = $state('');
	let notesValue = $state('');
	let partOfSpeechValue = $state<PartOfSpeech | ''>('');
	let altSpellingsValue = $state('');
	let pluralFormValue = $state('');
	let presentAnee = $state('');
	let presentInyee = $state('');
	let presentInee = $state('');
	let presentEchek = $state('');
	let presentOkwek = $state('');
	let presentIchek = $state('');

	$effect(() => {
		kalenjinValue = values.kalenjin ?? '';
	});
	$effect(() => {
		translationsValue = values.translations ?? '';
	});
	$effect(() => {
		notesValue = values.notes ?? '';
	});
	$effect(() => {
		partOfSpeechValue = (values.partOfSpeech ?? '') as PartOfSpeech | '';
	});
	$effect(() => {
		altSpellingsValue =
			form?.values?.alternativeSpellings ??
			data.word.spellings.map((spelling) => spelling.spelling).join(', ');
	});
	$effect(() => {
		pluralFormValue = (values as { pluralForm?: string | null }).pluralForm ?? '';
	});
	$effect(() => {
		presentAnee = data.word.presentAnee ?? '';
		presentInyee = data.word.presentInyee ?? '';
		presentInee = data.word.presentInee ?? '';
		presentEchek = data.word.presentEchek ?? '';
		presentOkwek = data.word.presentOkwek ?? '';
		presentIchek = data.word.presentIchek ?? '';
	});

	const translations = $derived(parseTranslationList(translationsValue));
	const altSpellingsList = $derived(
		altSpellingsValue
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0)
	);
	let altSpellingsOpen = $state(false);

	const showPlural = $derived(
		(data.word.partOfSpeech === 'NOUN' || data.word.partOfSpeech === 'ADJECTIVE') &&
			Boolean(data.word.pluralForm)
	);
	const showConjugations = $derived(
		data.word.partOfSpeech === 'VERB' &&
			(Boolean(data.word.presentAnee) ||
				Boolean(data.word.presentInyee) ||
				Boolean(data.word.presentInee) ||
				Boolean(data.word.presentEchek) ||
				Boolean(data.word.presentOkwek) ||
				Boolean(data.word.presentIchek))
	);
	const needsPluralInput = $derived(
		partOfSpeechValue === 'NOUN' || partOfSpeechValue === 'ADJECTIVE'
	);
	const needsConjugationInputs = $derived(partOfSpeechValue === 'VERB');

	let relatedQuery = $state('');
	let relatedSearchResults = $state<DictionarySearchResult[] | null>(null);
	let relatedSearchQuery = $state('');
	let relatedSearchLoading = $state(false);
	let relatedSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let relatedSearchSeq = 0;

	const relatedWordIds = $derived(new Set(data.word.relatedWords.map((link) => link.word.id)));
	const attachableRelatedResults = $derived(
		(relatedSearchResults ?? []).filter(
			(result) => result.id !== data.word.id && !relatedWordIds.has(result.id)
		)
	);

	function firstTranslation(value: string): string {
		return stripWordLinks(parseTranslationList(value)[0] ?? value);
	}

	async function runRelatedSearch(query: string) {
		const seq = ++relatedSearchSeq;
		const trimmed = query.trim();
		if (!trimmed) {
			relatedSearchResults = null;
			relatedSearchQuery = '';
			relatedSearchLoading = false;
			return;
		}

		relatedSearchLoading = true;
		try {
			const res = await fetch(`/dictionary/search?q=${encodeURIComponent(trimmed)}`);
			if (!res.ok) throw new Error(`Search failed: ${res.status}`);
			const json = (await res.json()) as { results: DictionarySearchResult[] };
			if (seq !== relatedSearchSeq) return;
			relatedSearchResults = json.results;
			relatedSearchQuery = trimmed;
		} catch {
			if (seq !== relatedSearchSeq) return;
			relatedSearchResults = [];
			relatedSearchQuery = trimmed;
		} finally {
			if (seq === relatedSearchSeq) relatedSearchLoading = false;
		}
	}

	function handleRelatedSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		relatedQuery = value;
		if (relatedSearchTimer) clearTimeout(relatedSearchTimer);
		relatedSearchTimer = setTimeout(() => runRelatedSearch(value), 180);
	}

	$effect(() => {
		if (form?.success) toast.success('Saved.');
	});
</script>

<svelte:head>
	<title>{kalenjinValue || data.word.kalenjin} — Kalenj.in</title>
</svelte:head>

<section>
	<a href="/dictionary" class="back-link">
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
			<path d="M7.5 2L3 6l4.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
		Back to dictionary
	</a>

	<div class="detail-shell">
		<div>
			<div class="entry-head">
				<div class="entry-label">Kalenjin entry</div>
				<div class="entry-title">
					<h1>{kalenjinValue}</h1>
				</div>
				<div class="entry-meta">
					{#if partOfSpeechValue}
						<span class="pos-chip">{POS_LABELS[partOfSpeechValue]}</span>
					{/if}
					{#if showPlural}
						<span class="plural-chip">
							<span class="plural-label">Plural</span>
							<span class="plural-value">{data.word.pluralForm}</span>
						</span>
					{/if}
					{#if altSpellingsList.length > 0}
						<button
							type="button"
							class="alt-spellings-toggle"
							aria-expanded={altSpellingsOpen}
							aria-controls="alt-spellings-panel"
							onclick={() => (altSpellingsOpen = !altSpellingsOpen)}
						>
							Also spelled ({altSpellingsList.length})
							<span class="caret" aria-hidden="true">{altSpellingsOpen ? '▾' : '▸'}</span>
						</button>
					{/if}
				</div>
				{#if altSpellingsOpen && altSpellingsList.length > 0}
					<div id="alt-spellings-panel" class="alt-spellings-panel">
						{altSpellingsList.join(', ')}
					</div>
				{/if}
			</div>

			<h2 class="section-title">Translations</h2>
			<ol class="translations-list">
				{#each translations as translation, index}
					<li>
						<span class="num">{index + 1}.</span>
						{@html renderWordLinks(translation)}
					</li>
				{/each}
			</ol>

			{#if showConjugations}
				<h2 class="section-title">Present tense</h2>
				<div class="conjugation-grid">
					<div class="conj-cell">
						<span class="conj-verb">{data.word.presentAnee ?? '—'}</span>
						<span class="conj-pronoun">anee</span>
					</div>
					<div class="conj-cell">
						<span class="conj-verb">{data.word.presentEchek ?? '—'}</span>
						<span class="conj-pronoun">echek</span>
					</div>
					<div class="conj-cell">
						<span class="conj-verb">{data.word.presentInyee ?? '—'}</span>
						<span class="conj-pronoun">inyee</span>
					</div>
					<div class="conj-cell">
						<span class="conj-verb">{data.word.presentOkwek ?? '—'}</span>
						<span class="conj-pronoun">okwek</span>
					</div>
					<div class="conj-cell">
						<span class="conj-verb">{data.word.presentInee ?? '—'}</span>
						<span class="conj-pronoun">inee</span>
					</div>
					<div class="conj-cell">
						<span class="conj-verb">{data.word.presentIchek ?? '—'}</span>
						<span class="conj-pronoun">ichek</span>
					</div>
				</div>
			{/if}

			{#if notesValue.trim()}
				<h2 class="section-title">Notes</h2>
				<div class="notes-markdown muted">{@html renderMarkdown(notesValue)}</div>
			{/if}

			<h2 class="section-title">Related words</h2>
			{#if data.word.relatedWords.length === 0}
				<p class="muted" style="font-size: 15px; margin: 0;">No related words yet.</p>
			{:else}
				<div class="related-word-grid">
					{#each data.word.relatedWords as link (link.word.id)}
						<a href={`/dictionary/${link.word.id}`} class="related-word-card">
							<span class="related-word-title">{link.word.kalenjin}</span>
							<span class="related-word-gloss">{firstTranslation(link.word.translations)}</span>
							{#if link.word.partOfSpeech}
								<span class="pos-chip tiny">{POS_LABELS[link.word.partOfSpeech]}</span>
							{/if}
						</a>
					{/each}
				</div>
			{/if}

			<h2 class="section-title">Examples from the corpus</h2>
			{#if data.word.sentences.length === 0}
				<p class="muted" style="font-size: 15px; margin: 0;">No corpus examples yet.</p>
			{:else}
				{#each data.word.sentences as link}
					<div class="example">
						<div class="kal">
							<TokenHoverPreview
								sentenceId={link.exampleSentence.id}
								sentenceText={link.exampleSentence.kalenjin}
								tokens={link.exampleSentence.tokens}
							/>
						</div>
						<div class="en">{link.exampleSentence.english}</div>
					</div>
				{/each}
			{/if}
		</div>

		<aside>
			<div class="side-card">
				<h3>At a glance</h3>
				<table class="glance-table">
					<tbody>
						<tr>
							<td>Part of speech</td>
							<td>{partOfSpeechValue ? POS_LABELS[partOfSpeechValue] : '—'}</td>
						</tr>
						{#if data.word.partOfSpeech === 'NOUN' || data.word.partOfSpeech === 'ADJECTIVE'}
							<tr>
								<td>Plural</td>
								<td>{data.word.pluralForm ?? '—'}</td>
							</tr>
						{/if}
						{#if data.word.partOfSpeech === 'VERB'}
							<tr>
								<td>Conjugations</td>
								<td>{showConjugations ? 'Present tense' : '—'}</td>
							</tr>
						{/if}
						<tr>
							<td>Translations</td>
							<td>{translations.length}</td>
						</tr>
						<tr>
							<td>Examples</td>
							<td>{data.word.sentences.length}</td>
						</tr>
					</tbody>
				</table>
			</div>

			{#if data.user}
				<div class="side-card">
					<h3>Edit entry</h3>

					{#if form?.error}
						<div class="form-feedback error">{form.error}</div>
					{/if}

					<form
						method="POST"
						action="?/update"
						use:enhance={() => {
							return async ({ update }) => {
								await update({ reset: false });
							};
						}}
					>
						<div class="side-field">
							<label for="kalenjin">Kalenjin</label>
							<input
								id="kalenjin"
								name="kalenjin"
								class="side-input"
								required
								bind:value={kalenjinValue}
							/>
						</div>
						<div class="side-field">
							<label for="translations">Translations</label>
							<WordLinkEditor
								id="translations"
								name="translations"
								className="side-input"
								required
								placeholder="semicolon-separated"
								bind:value={translationsValue}
							/>
						</div>
						<div class="side-field">
							<label for="alternativeSpellings">Alternative spellings</label>
							<input
								id="alternativeSpellings"
								name="alternativeSpellings"
								type="text"
								class="side-input"
								placeholder="Comma-separated"
								bind:value={altSpellingsValue}
							/>
						</div>
						<div class="side-field">
							<label for="partOfSpeech">Part of speech</label>
							<select
								id="partOfSpeech"
								name="partOfSpeech"
								class="side-select"
								bind:value={partOfSpeechValue}
							>
								<option value="">—</option>
								{#each PARTS_OF_SPEECH as pos}
									<option value={pos}>{POS_LABELS[pos]}</option>
								{/each}
							</select>
						</div>
						{#if needsPluralInput}
							<div class="side-field">
								<label for="pluralForm">Plural</label>
								<input
									id="pluralForm"
									name="pluralForm"
									type="text"
									class="side-input"
									placeholder="e.g. chego"
									bind:value={pluralFormValue}
								/>
							</div>
						{:else}
							<input type="hidden" name="pluralForm" value="" />
						{/if}
						{#if needsConjugationInputs}
							<div class="side-field">
								<span class="conjugation-sub">Present tense</span>
								<div class="conjugation-input-grid">
									<div class="conj-input-field">
										<label for="presentAnee">anee</label>
										<input
											id="presentAnee"
											name="presentAnee"
											type="text"
											class="side-input"
											bind:value={presentAnee}
										/>
									</div>
									<div class="conj-input-field">
										<label for="presentEchek">echek</label>
										<input
											id="presentEchek"
											name="presentEchek"
											type="text"
											class="side-input"
											bind:value={presentEchek}
										/>
									</div>
									<div class="conj-input-field">
										<label for="presentInyee">inyee</label>
										<input
											id="presentInyee"
											name="presentInyee"
											type="text"
											class="side-input"
											bind:value={presentInyee}
										/>
									</div>
									<div class="conj-input-field">
										<label for="presentOkwek">okwek</label>
										<input
											id="presentOkwek"
											name="presentOkwek"
											type="text"
											class="side-input"
											bind:value={presentOkwek}
										/>
									</div>
									<div class="conj-input-field">
										<label for="presentInee">inee</label>
										<input
											id="presentInee"
											name="presentInee"
											type="text"
											class="side-input"
											bind:value={presentInee}
										/>
									</div>
									<div class="conj-input-field">
										<label for="presentIchek">ichek</label>
										<input
											id="presentIchek"
											name="presentIchek"
											type="text"
											class="side-input"
											bind:value={presentIchek}
										/>
									</div>
								</div>
							</div>
						{:else}
							<input type="hidden" name="presentAnee" value="" />
							<input type="hidden" name="presentInyee" value="" />
							<input type="hidden" name="presentInee" value="" />
							<input type="hidden" name="presentEchek" value="" />
							<input type="hidden" name="presentOkwek" value="" />
							<input type="hidden" name="presentIchek" value="" />
						{/if}
						<div class="side-field">
							<label for="notes">Notes</label>
							<WordLinkEditor
								id="notes"
								name="notes"
								className="side-textarea"
								multiline
								bind:value={notesValue}
							/>
						</div>
						<div style="display: flex; gap: 8px; margin-top: 4px;">
							<button type="submit" class="btn-sm">Save</button>
						</div>
					</form>
				</div>

				<div class="side-card">
					<h3>Related words</h3>

					{#if form?.relatedWordError}
						<div class="form-feedback error">{form.relatedWordError}</div>
					{:else if form?.relatedWordSuccess}
						<div class="form-feedback success">Related words updated.</div>
					{/if}

					{#if data.word.relatedWords.length === 0}
						<p class="related-editor-empty">No related words linked.</p>
					{:else}
						<ul class="related-editor-list">
							{#each data.word.relatedWords as link (link.word.id)}
								<li>
									<a href={`/dictionary/${link.word.id}`}>
										<span>{link.word.kalenjin}</span>
										<small>{firstTranslation(link.word.translations)}</small>
									</a>
									<form method="POST" action="?/removeRelatedWord">
										<input type="hidden" name="relatedWordId" value={link.word.id} />
										<button type="submit" class="btn-sm ghost">Remove</button>
									</form>
								</li>
							{/each}
						</ul>
					{/if}

					<div class="side-field">
						<label for="relatedWordSearch">Attach another word</label>
						<input
							id="relatedWordSearch"
							type="search"
							class="side-input"
							placeholder="Search Kalenjin or English"
							autocomplete="off"
							value={relatedQuery}
							oninput={handleRelatedSearchInput}
						/>
					</div>

					{#if relatedSearchLoading}
						<p class="related-editor-empty">Searching...</p>
					{:else if relatedSearchResults !== null}
						{#if attachableRelatedResults.length === 0}
							<p class="related-editor-empty">No attachable matches for “{relatedSearchQuery}”.</p>
						{:else}
							<ul class="related-search-results">
								{#each attachableRelatedResults as result (result.id)}
									<li>
										<form method="POST" action="?/addRelatedWord">
											<input type="hidden" name="relatedWordId" value={result.id} />
											<button type="submit" class="related-search-button">
												<span>
													<strong>{result.kalenjin}</strong>
													<small>{firstTranslation(result.translations)}</small>
												</span>
												<span class="related-add-label">Add</span>
											</button>
										</form>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				</div>

				<div class="side-card">
					<h3>Danger zone</h3>
					<form method="POST" action="?/delete">
						<button type="submit" class="btn-sm danger" style="width: 100%">Delete this entry</button>
					</form>
				</div>
			{/if}
		</aside>
	</div>
</section>

<style>
	.alt-spellings-toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font: inherit;
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
		font-weight: 500;
		padding: 3px 8px;
		border: 1px solid var(--line);
		border-radius: 3px;
		background: var(--bg-raised);
		cursor: pointer;
		transition: color 0.12s, background 0.12s;
	}
	.alt-spellings-toggle:hover {
		color: var(--ink);
		background: color-mix(in oklch, var(--bg-raised) 70%, var(--ink) 6%);
	}
	.alt-spellings-toggle .caret {
		font-size: 10px;
		opacity: 0.7;
	}
	.alt-spellings-panel {
		margin-top: 12px;
		font-size: 14px;
		color: var(--ink-soft);
		font-style: italic;
	}
	.notes-markdown :global(p) {
		margin: 0 0 0.5em;
		font-size: 15px;
	}
	.notes-markdown :global(p:last-child) {
		margin-bottom: 0;
	}
	.notes-markdown :global(ul),
	.notes-markdown :global(ol) {
		margin: 0 0 0.5em;
		padding-left: 1.5em;
		font-size: 15px;
	}
	.notes-markdown :global(li) {
		margin: 0.125em 0;
	}
	.notes-markdown :global(h1),
	.notes-markdown :global(h2),
	.notes-markdown :global(h3),
	.notes-markdown :global(h4),
	.notes-markdown :global(h5),
	.notes-markdown :global(h6) {
		margin: 0.75em 0 0.25em;
		font-size: 1em;
		font-weight: 600;
	}
	.notes-markdown :global(code) {
		background: rgba(128, 128, 128, 0.15);
		padding: 1px 4px;
		border-radius: 3px;
		font-size: 0.9em;
	}
	.notes-markdown :global(pre) {
		background: rgba(128, 128, 128, 0.12);
		padding: 8px 10px;
		border-radius: 4px;
		overflow-x: auto;
		font-size: 13px;
	}
	.notes-markdown :global(blockquote) {
		margin: 0.5em 0;
		padding-left: 10px;
		border-left: 3px solid rgba(128, 128, 128, 0.4);
		color: var(--muted, #666);
	}
	.notes-markdown :global(hr) {
		border: 0;
		border-top: 1px solid rgba(128, 128, 128, 0.25);
		margin: 0.75em 0;
	}

	.plural-chip {
		align-items: baseline;
		background: color-mix(in oklch, var(--accent) 14%, transparent);
		border: 1px solid color-mix(in oklch, var(--accent) 28%, var(--line));
		border-radius: 999px;
		display: inline-flex;
		gap: 6px;
		padding: 2px 10px;
	}
	.plural-label {
		color: var(--ink-mute);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.plural-value {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 14px;
		font-weight: 500;
	}
	.conjugation-grid {
		display: grid;
		gap: 8px 24px;
		grid-template-columns: 1fr 1fr;
		margin: 0 0 4px;
	}
	.conj-cell {
		align-items: baseline;
		border-bottom: 1px solid var(--line);
		display: flex;
		gap: 8px;
		padding: 8px 0;
	}
	.conj-verb {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 15px;
	}
	.conj-pronoun {
		color: var(--ink-mute);
		font-family: var(--font-display);
		font-size: 13px;
		font-style: italic;
	}
	.conjugation-sub {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.conjugation-input-grid {
		display: grid;
		gap: 8px 12px;
		grid-template-columns: 1fr 1fr;
		margin-top: 6px;
	}
	.conj-input-field {
		display: grid;
		gap: 4px;
	}
	.conj-input-field label {
		color: var(--ink-mute);
		font-family: var(--font-display);
		font-size: 12px;
		font-style: italic;
	}
	@media (max-width: 640px) {
		.conjugation-grid {
			grid-template-columns: 1fr;
		}
		.conjugation-input-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
