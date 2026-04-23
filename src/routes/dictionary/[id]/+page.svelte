<script lang="ts">
	import { PARTS_OF_SPEECH } from '$lib/parts-of-speech';
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';
	import { parseTranslationList } from '$lib/translations';
	import type { PartOfSpeech } from '@prisma/client';

	let { data, form } = $props();

	type DictionarySearchResult = {
		id: string;
		kalenjin: string;
		translations: string;
		partOfSpeech: PartOfSpeech | null;
	};

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

	const values = $derived(form?.values ?? data.word);
	const alternativeSpellingsValue = $derived.by(() =>
		form?.values?.alternativeSpellings ?? data.word.spellings.map((spelling) => spelling.spelling).join('\n')
	);
	const translations = $derived(parseTranslationList(data.word.translations));

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
		return parseTranslationList(value)[0] ?? value;
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
</script>

<svelte:head>
	<title>{data.word.kalenjin} — Kalenj.in</title>
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
					<h1>{data.word.kalenjin}</h1>
				</div>
				<div class="entry-meta">
					{#if data.word.partOfSpeech}
						<span class="pos-chip">{POS_LABELS[data.word.partOfSpeech]}</span>
					{/if}
				</div>
			</div>

			<h2 class="section-title">Translations</h2>
			<ol class="translations-list">
				{#each translations as translation, index}
					<li>
						<span class="num">{index + 1}.</span>
						{translation}
					</li>
				{/each}
			</ol>

			{#if data.word.notes}
				<h2 class="section-title">Notes</h2>
				<p class="muted" style="font-size: 15px; margin: 0;">{data.word.notes}</p>
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
						<div class="en"><SentenceTimeText text={link.exampleSentence.english} /></div>
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
							<td>{data.word.partOfSpeech ? POS_LABELS[data.word.partOfSpeech] : '—'}</td>
						</tr>
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
					{:else if form?.success}
						<div class="form-feedback success">Saved.</div>
					{/if}

					<form method="POST" action="?/update">
						<div class="side-field">
							<label for="kalenjin">Kalenjin</label>
							<input id="kalenjin" name="kalenjin" class="side-input" required value={values.kalenjin ?? ''} />
						</div>
						<div class="side-field">
							<label for="translations">Translations</label>
							<input
								id="translations"
								name="translations"
								class="side-input"
								required
								value={values.translations ?? ''}
								placeholder="semicolon-separated"
							/>
						</div>
						<div class="side-field">
							<label for="alternativeSpellings">Alternative spellings</label>
							<textarea
								id="alternativeSpellings"
								name="alternativeSpellings"
								class="side-textarea"
								placeholder="One spelling per line"
							>{alternativeSpellingsValue}</textarea>
						</div>
						<div class="side-field">
							<label for="partOfSpeech">Part of speech</label>
							<select id="partOfSpeech" name="partOfSpeech" class="side-select">
								<option value="">—</option>
								{#each PARTS_OF_SPEECH as pos}
									<option value={pos} selected={values.partOfSpeech === pos}>{POS_LABELS[pos]}</option>
								{/each}
							</select>
						</div>
						<div class="side-field">
							<label for="notes">Notes</label>
							<textarea id="notes" name="notes" class="side-textarea">{values.notes ?? ''}</textarea>
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
