<script lang="ts">
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import AudioRecorder from '$lib/components/AudioRecorder.svelte';
	import PartOfSpeechInline from '$lib/components/PartOfSpeechInline.svelte';
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';
	import WordLinkEditor from '$lib/components/WordLinkEditor.svelte';
	import ImageUploadField from '$lib/components/ImageUploadField.svelte';
	import { PART_OF_SPEECH_LABELS, PARTS_OF_SPEECH } from '$lib/parts-of-speech';
	import { splitPluralFormVariants } from '$lib/plural-form-variants';
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

	let imageExpanded = $state(false);
	let liveImageUrl = $state<string | null>(null);
	let kalenjinValue = $state('');
	let translationsValue = $state('');
	let notesValue = $state('');
	let partOfSpeechValue = $state<PartOfSpeech | ''>('');
	let altSpellingsValue = $state('');
	let pluralFormValue = $state('');
	let isPluralOnly = $state(false);
	let alternativePluralFormsValue = $state('');
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
		const { pluralForm, alternativePluralForms } = splitPluralFormVariants(
			(values as { pluralForm?: string | null }).pluralForm ?? ''
		);
		pluralFormValue = pluralForm;
		alternativePluralFormsValue =
			(form?.values?.alternativePluralForms ?? alternativePluralForms) as string;
	});
	$effect(() => {
		isPluralOnly = Boolean((values as { isPluralOnly?: boolean }).isPluralOnly);
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
	const showPluralOnly = $derived(
		(data.word.partOfSpeech === 'NOUN' || data.word.partOfSpeech === 'ADJECTIVE') &&
			data.word.isPluralOnly
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
	$effect(() => {
		if (form?.relatedWordSuccess) toast.success('Related words updated.');
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
					<AudioPlayButton
						audioUrl={data.word.audioUrl}
						label={`Play pronunciation of ${kalenjinValue}`}
					/>
				</div>
				<div class="entry-meta">
					{#if partOfSpeechValue}
						<PartOfSpeechInline value={partOfSpeechValue} />
					{/if}
					{#if showPlural}
						<span class="plural-chip">
							<span class="plural-label">Plural</span>
							<span class="plural-value">{data.word.pluralForm}</span>
						</span>
					{:else if showPluralOnly}
						<span class="plural-chip">
							<span class="plural-label">Plural-only</span>
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
			<div class="translations-body" class:has-image={Boolean(liveImageUrl)}>
				<ol class="translations-list">
					{#each translations as translation, index}
						<li>
							<span class="num">{index + 1}.</span>
							{@html renderWordLinks(translation)}
						</li>
					{/each}
				</ol>
				{#if liveImageUrl}
					<button
						type="button"
						class="entry-image-btn"
						onclick={() => (imageExpanded = true)}
						aria-label="Expand image"
					>
						<img src={liveImageUrl} alt="" class="entry-image" />
					</button>
				{/if}
			</div>

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
							<span class="related-word-heading">
								<span class="related-word-title">{link.word.kalenjin}</span>
								{#if link.word.partOfSpeech}
									<PartOfSpeechInline value={link.word.partOfSpeech} size="tiny" />
								{/if}
							</span>
							<span class="related-word-gloss">{firstTranslation(link.word.translations)}</span>
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
			{#if data.user}
				<div class="side-card">
					<h3>Pronunciation</h3>
					<AudioRecorder
						targetType="word"
						targetId={data.word.id}
						currentAudioUrl={data.word.audioUrl}
					/>
				</div>

				<div class="side-card">
					<h3>Edit entry</h3>

					{#if form?.error}
						<div class="form-feedback error">{form.error}</div>
					{/if}

					<form
						method="POST"
						action="?/update"
						enctype="multipart/form-data"
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
							<div class="side-field-grid">
								<div class="side-field">
									<label for="pluralForm">Plural</label>
									<input
										id="pluralForm"
										name="pluralForm"
										type="text"
										class="side-input"
										placeholder="e.g. chego"
										disabled={isPluralOnly}
										bind:value={pluralFormValue}
									/>
								</div>
								<div class="side-field">
									<label for="alternativePluralForms">Alternative plurals</label>
									<input
										id="alternativePluralForms"
										name="alternativePluralForms"
										type="text"
										class="side-input"
										placeholder="comma, separated"
										disabled={isPluralOnly}
										bind:value={alternativePluralFormsValue}
									/>
								</div>
							</div>
							<label class="plural-only-toggle">
								<input
									type="checkbox"
									name="isPluralOnly"
									bind:checked={isPluralOnly}
								/>
								<span>Plural-only</span>
							</label>
						{:else}
							<input type="hidden" name="pluralForm" value="" />
							<input type="hidden" name="isPluralOnly" value="" />
							<input type="hidden" name="alternativePluralForms" value="" />
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
						<div class="side-field">
							<ImageUploadField
								currentUrl={data.word.imageUrl}
								idPrefix="word-edit-image"
								bind:effectiveUrl={liveImageUrl}
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
									<form
										method="POST"
										action="?/removeRelatedWord"
										use:enhance={() => {
											return async ({ update }) => {
												await update({ reset: false });
											};
										}}
									>
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
										<form
											method="POST"
											action="?/addRelatedWord"
											use:enhance={() => {
												return async ({ update }) => {
													await update({ reset: false });
												};
											}}
										>
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

{#if imageExpanded && liveImageUrl}
	<div
		class="image-lightbox"
		role="dialog"
		aria-modal="true"
		aria-label="Expanded image"
		onclick={() => (imageExpanded = false)}
		onkeydown={(e) => {
			if (e.key === 'Escape') imageExpanded = false;
		}}
		tabindex="-1"
	>
		<img src={liveImageUrl} alt="" class="lightbox-image" />
		<button
			type="button"
			class="lightbox-close"
			onclick={(e) => {
				e.stopPropagation();
				imageExpanded = false;
			}}
			aria-label="Close"
		>×</button>
	</div>
{/if}

<style>
	.translations-body {
		display: grid;
		gap: 16px;
	}
	.translations-body.has-image {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
	}
	.translations-list {
		min-width: 0;
	}
	.entry-image-btn {
		background: none;
		border: 0;
		padding: 0;
		cursor: zoom-in;
		justify-self: end;
	}
	.entry-image {
		display: block;
		max-width: 180px;
		max-height: 140px;
		object-fit: contain;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--bg-raised);
	}
	@media (max-width: 560px) {
		.translations-body.has-image {
			grid-template-columns: 1fr;
		}
		.entry-image-btn {
			justify-self: start;
		}
	}
	.image-lightbox {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.78);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		z-index: 90;
		cursor: zoom-out;
	}
	.lightbox-image {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: 8px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}
	.lightbox-close {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: rgba(0, 0, 0, 0.5);
		color: #fff;
		border: 0;
		border-radius: 50%;
		width: 36px;
		height: 36px;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
	}
	.lightbox-close:hover {
		background: rgba(0, 0, 0, 0.75);
	}
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
	.side-field-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: 1fr 1fr;
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
		gap: 2px 20px;
		grid-template-columns: max-content max-content;
		margin: 0 0 4px;
	}
	.conj-cell {
		align-items: baseline;
		display: flex;
		gap: 8px;
		padding: 2px 0;
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
	.plural-only-toggle {
		align-items: center;
		color: var(--ink-soft);
		display: inline-flex;
		font-size: 13px;
		gap: 8px;
		margin-top: 8px;
	}
	.plural-only-toggle input {
		accent-color: var(--brand);
	}
	.side-input:disabled {
		background: color-mix(in oklch, var(--ink-mute) 8%, var(--paper));
		color: var(--ink-mute);
		cursor: not-allowed;
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
		.side-field-grid {
			grid-template-columns: 1fr;
		}
		.conjugation-grid {
			grid-template-columns: 1fr;
		}
		.conjugation-input-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
