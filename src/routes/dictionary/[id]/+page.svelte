<script lang="ts">
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import AudioRecorder from '$lib/components/AudioRecorder.svelte';
	import EditModeToggle from '$lib/components/EditModeToggle.svelte';
	import FormErrorFeedback from '$lib/components/FormErrorFeedback.svelte';
	import PartOfSpeechInline from '$lib/components/PartOfSpeechInline.svelte';
	import SidePanel from '$lib/components/SidePanel.svelte';
	import TokenHoverPreview from '$lib/components/TokenHoverPreview.svelte';
	import WordLinkEditor from '$lib/components/WordLinkEditor.svelte';
	import ImageUploadField from '$lib/components/ImageUploadField.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import BackLink from '$lib/components/BackLink.svelte';
	import ReportDialog from '$lib/components/ReportDialog.svelte';
	import SwahiliLoanIndicator from '$lib/components/SwahiliLoanIndicator.svelte';
	import SwahiliLoanToggle from '$lib/components/SwahiliLoanToggle.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import WordPill from '$lib/components/WordPill.svelte';
	import { getEditMode } from '$lib/stores/editMode.svelte';
	import { PART_OF_SPEECH_LABELS, PARTS_OF_SPEECH } from '$lib/parts-of-speech';
	import { splitPluralFormVariants } from '$lib/plural-form-variants';
	import { parseTranslationList } from '$lib/translations';
	import { renderWordLinks, stripWordLinks } from '$lib/word-links';
	import { dictionaryEntryHref } from '$lib/word-url';
	import { renderMarkdown } from '$lib/markdown';
	import { toast } from '$lib/stores/toast.svelte';
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type { PartOfSpeech } from '@prisma/client';

	let { data, form } = $props();

	type DictionarySearchResult = {
		id: string;
		kalenjin: string;
		slug?: string;
		href?: string;
		translations: string;
		partOfSpeech: PartOfSpeech | null;
		isSwahiliLoan: boolean;
	};
	const POS_LABELS = PART_OF_SPEECH_LABELS;
	const values = $derived(form?.values ?? data.word);

	const editModeCtx = getEditMode();
	const isStaff = $derived(data.user?.role === 'ADMIN' || data.user?.role === 'MANAGER');
	const editMode = $derived(isStaff && editModeCtx.value);

	let imageExpanded = $state(false);
	let liveImageUrl = $state<string | null>(untrack(() => data.word.imageUrl));
	let imageDirty = $state(false);
	let kalenjinValue = $state(untrack(() => values.kalenjin ?? ''));
	let translationsValue = $state(untrack(() => values.translations ?? ''));
	let notesValue = $state(untrack(() => values.notes ?? ''));
	let partOfSpeechValue = $state<PartOfSpeech | ''>(
		untrack(() => (values.partOfSpeech ?? '') as PartOfSpeech | '')
	);
	let altSpellingsValue = $state(
		untrack(
			() =>
				form?.values?.alternativeSpellings ??
				data.word.spellings.map((spelling) => spelling.spelling).join(', ')
		)
	);
	let pluralFormValue = $state(
		untrack(
			() =>
				splitPluralFormVariants((values as { pluralForm?: string | null }).pluralForm ?? '')
					.pluralForm
		)
	);
	let isPluralOnly = $state(
		untrack(() => Boolean((values as { isPluralOnly?: boolean }).isPluralOnly))
	);
	let isSingularOnly = $state(
		untrack(() => Boolean((values as { isSingularOnly?: boolean }).isSingularOnly))
	);
	let incertainFormValue = $state(
		untrack(
			() =>
				splitPluralFormVariants((values as { incertainForm?: string | null }).incertainForm ?? '')
					.pluralForm
		)
	);
	let alternativeIncertainFormsValue = $state(
		untrack(() => {
			const { alternativePluralForms } = splitPluralFormVariants(
				(values as { incertainForm?: string | null }).incertainForm ?? ''
			);
			return (form?.values?.alternativeIncertainForms ?? alternativePluralForms) as string;
		})
	);
	let isSwahiliLoan = $state(
		untrack(() => Boolean((values as { isSwahiliLoan?: boolean }).isSwahiliLoan))
	);
	let alternativePluralFormsValue = $state(
		untrack(() => {
			const { alternativePluralForms } = splitPluralFormVariants(
				(values as { pluralForm?: string | null }).pluralForm ?? ''
			);
			return (form?.values?.alternativePluralForms ?? alternativePluralForms) as string;
		})
	);
	let presentAnee = $state(untrack(() => data.word.presentAnee ?? ''));
	let presentInyee = $state(untrack(() => data.word.presentInyee ?? ''));
	let presentInee = $state(untrack(() => data.word.presentInee ?? ''));
	let presentEchek = $state(untrack(() => data.word.presentEchek ?? ''));
	let presentOkwek = $state(untrack(() => data.word.presentOkwek ?? ''));
	let presentIchek = $state(untrack(() => data.word.presentIchek ?? ''));

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
		isSingularOnly = Boolean((values as { isSingularOnly?: boolean }).isSingularOnly);
	});
	$effect(() => {
		const { pluralForm, alternativePluralForms } = splitPluralFormVariants(
			(values as { incertainForm?: string | null }).incertainForm ?? ''
		);
		incertainFormValue = pluralForm;
		alternativeIncertainFormsValue =
			(form?.values?.alternativeIncertainForms ?? alternativePluralForms) as string;
	});
	$effect(() => {
		isSwahiliLoan = Boolean((values as { isSwahiliLoan?: boolean }).isSwahiliLoan);
	});
	$effect(() => {
		presentAnee = data.word.presentAnee ?? '';
		presentInyee = data.word.presentInyee ?? '';
		presentInee = data.word.presentInee ?? '';
		presentEchek = data.word.presentEchek ?? '';
		presentOkwek = data.word.presentOkwek ?? '';
		presentIchek = data.word.presentIchek ?? '';
	});
	$effect(() => {
		if (!imageDirty) liveImageUrl = data.word.imageUrl;
	});

	const translations = $derived(parseTranslationList(translationsValue));
	const altSpellingsList = $derived(
		altSpellingsValue
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0)
	);
	const savedPluralForms = $derived(splitPluralFormVariants(data.word.pluralForm ?? ''));
	const savedIncertainForms = $derived(splitPluralFormVariants(data.word.incertainForm ?? ''));
	const savedAlternativeSpellings = $derived(
		data.word.spellings.map((spelling) => spelling.spelling).join(', ')
	);
	const editEntryDirty = $derived(
		kalenjinValue !== data.word.kalenjin ||
			translationsValue !== data.word.translations ||
			notesValue !== (data.word.notes ?? '') ||
			partOfSpeechValue !== (data.word.partOfSpeech ?? '') ||
			altSpellingsValue !== savedAlternativeSpellings ||
			pluralFormValue !== savedPluralForms.pluralForm ||
			alternativePluralFormsValue !== savedPluralForms.alternativePluralForms ||
			isPluralOnly !== data.word.isPluralOnly ||
			isSingularOnly !== data.word.isSingularOnly ||
			incertainFormValue !== savedIncertainForms.pluralForm ||
			alternativeIncertainFormsValue !== savedIncertainForms.alternativePluralForms ||
			isSwahiliLoan !== data.word.isSwahiliLoan ||
			imageDirty ||
			presentAnee !== (data.word.presentAnee ?? '') ||
			presentInyee !== (data.word.presentInyee ?? '') ||
			presentInee !== (data.word.presentInee ?? '') ||
			presentEchek !== (data.word.presentEchek ?? '') ||
			presentOkwek !== (data.word.presentOkwek ?? '') ||
			presentIchek !== (data.word.presentIchek ?? '')
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
	const showSingularOnly = $derived(
		(data.word.partOfSpeech === 'NOUN' || data.word.partOfSpeech === 'ADJECTIVE') &&
			data.word.isSingularOnly
	);
	const showIncertain = $derived(
		data.word.partOfSpeech === 'NOUN' && Boolean(data.word.incertainForm)
	);
	const showConjugations = $derived(
		(data.word.partOfSpeech === 'VERB' &&
			[
				data.word.presentAnee,
				data.word.presentInyee,
				data.word.presentInee,
				data.word.presentEchek,
				data.word.presentOkwek,
				data.word.presentIchek
			].some(Boolean)) ||
			(partOfSpeechValue === 'VERB' &&
				[presentAnee, presentInyee, presentInee, presentEchek, presentOkwek, presentIchek].some(
					(value) => value.trim().length > 0
				))
	);
	function displayPresent(localValue: string): string {
		return localValue || '—';
	}
	const needsPluralInput = $derived(
		partOfSpeechValue === 'NOUN' || partOfSpeechValue === 'ADJECTIVE'
	);
	const needsIncertainInput = $derived(partOfSpeechValue === 'NOUN');
	const needsConjugationInputs = $derived(partOfSpeechValue === 'VERB');

	let relatedQuery = $state('');
	let relatedSearchResults = $state<DictionarySearchResult[] | null>(null);
	let relatedSearchQuery = $state('');
	let relatedSearchLoading = $state(false);
	let relatedSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let relatedSearchSeq = 0;

	let pendingDeleteForm = $state<HTMLFormElement | null>(null);
	let reportDialogOpen = $state(false);

	function requestDeleteEntry(event: SubmitEvent) {
		if (pendingDeleteForm === event.currentTarget) return;
		event.preventDefault();
		pendingDeleteForm = event.currentTarget as HTMLFormElement;
	}

	function cancelPendingDelete() {
		pendingDeleteForm = null;
	}

	function confirmPendingDelete() {
		if (!pendingDeleteForm) return;
		const form = pendingDeleteForm;
		pendingDeleteForm = null;
		form.submit();
	}

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
	<title>{data.socialPreview.title}</title>
	<meta name="description" content={data.socialPreview.description} />
	<link rel="canonical" href={data.socialPreview.url} />
	<meta property="og:site_name" content="Kalenj.in" />
	<meta property="og:type" content="article" />
	<meta property="og:url" content={data.socialPreview.url} />
	<meta property="og:title" content={data.socialPreview.title} />
	<meta property="og:description" content={data.socialPreview.description} />
	<meta property="og:image" content={data.socialPreview.image.url} />
	<meta property="og:image:alt" content={data.socialPreview.image.alt} />
	<meta
		name="twitter:card"
		content={data.socialPreview.image.isPageSpecific ? 'summary_large_image' : 'summary'}
	/>
	<meta name="twitter:title" content={data.socialPreview.title} />
	<meta name="twitter:description" content={data.socialPreview.description} />
	<meta name="twitter:image" content={data.socialPreview.image.url} />
	<meta name="twitter:image:alt" content={data.socialPreview.image.alt} />
</svelte:head>

<section>
	<div class="detail-top-row">
		<BackLink href="/dictionary" label="Back to dictionary" />
		<div class="entry-top-actions">
			<Tooltip label="Report an issue">
				<button
					type="button"
					class="icon-action-btn"
					onclick={() => (reportDialogOpen = true)}
					aria-label="Report an issue"
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
						<line x1="4" y1="22" x2="4" y2="15" />
					</svg>
				</button>
			</Tooltip>
			{#if isStaff}
				<EditModeToggle />
			{/if}
		</div>
	</div>

	<div class="detail-shell" class:detail-shell-solo={!editMode}>
		<div>
			<div class="entry-head">
				<div class="entry-title">
					<h1>{kalenjinValue}</h1>
					<AudioPlayButton
						audioUrl={data.word.audioUrl}
						label={`Play pronunciation of ${kalenjinValue}`}
					/>
					{#if showIncertain || showPlural}
						<div class="entry-forms">
							{#if showIncertain}
								{@const incertainVariants = splitPluralFormVariants(data.word.incertainForm)}
								{@const primaryIncertain = incertainVariants.pluralForm}
								{@const altIncertain = incertainVariants.alternativePluralForms}
								<span class="entry-form">
									<span class="entry-form-top">
										{#if altIncertain}
											<Tooltip label={altIncertain}>
												<span class="entry-form-word">{primaryIncertain}</span>
											</Tooltip>
										{:else}
											<span class="entry-form-word">{primaryIncertain}</span>
										{/if}
										{#if data.word.incertainAudioUrl}
											<AudioPlayButton
												audioUrl={data.word.incertainAudioUrl}
												size="sm"
												label={`Play incertain pronunciation of ${primaryIncertain}`}
											/>
										{/if}
									</span>
									<span class="entry-form-label-slot">
										<Tooltip label="Incertain singular">
											<span class="entry-form-label">inc.</span>
										</Tooltip>
									</span>
								</span>
							{/if}
							{#if showPlural}
								{@const pluralVariants = splitPluralFormVariants(data.word.pluralForm)}
								{@const primaryPlural = pluralVariants.pluralForm}
								{@const altPlurals = pluralVariants.alternativePluralForms}
								<span class="entry-form">
									<span class="entry-form-top">
										{#if altPlurals}
											<Tooltip label={altPlurals}>
												<span class="entry-form-word">{primaryPlural}</span>
											</Tooltip>
										{:else}
											<span class="entry-form-word">{primaryPlural}</span>
										{/if}
										{#if data.word.pluralAudioUrl}
											<AudioPlayButton
												audioUrl={data.word.pluralAudioUrl}
												size="sm"
												label={`Play plural pronunciation of ${primaryPlural}`}
											/>
										{/if}
									</span>
									<span class="entry-form-label-slot">
										<Tooltip label="Plural">
											<span class="entry-form-label">pl.</span>
										</Tooltip>
									</span>
								</span>
							{/if}
						</div>
					{/if}
					{#if partOfSpeechValue || isSwahiliLoan || showPluralOnly || showSingularOnly}
						<div class="entry-title-pills">
							{#if partOfSpeechValue}
								<PartOfSpeechInline value={partOfSpeechValue} />
							{/if}
							{#if isSwahiliLoan}
								<SwahiliLoanIndicator />
							{/if}
							{#if showPluralOnly}
								<WordPill text="pl" tooltip="Plural-only" lowercase abbreviation />
							{:else if showSingularOnly}
								<WordPill text="sg" tooltip="Singular-only" lowercase abbreviation />
							{/if}
						</div>
					{/if}
				</div>
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
							<span class="trans-text">{@html renderWordLinks(translation)}</span>
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
						<span class="conj-verb">{displayPresent(presentAnee)}</span>
						<span class="conj-pronoun">anee</span>
					</div>
					<div class="conj-cell">
						<span class="conj-verb">{displayPresent(presentEchek)}</span>
						<span class="conj-pronoun">echek</span>
					</div>
					<div class="conj-cell">
						<span class="conj-verb">{displayPresent(presentInyee)}</span>
						<span class="conj-pronoun">inyee</span>
					</div>
					<div class="conj-cell">
						<span class="conj-verb">{displayPresent(presentOkwek)}</span>
						<span class="conj-pronoun">okwek</span>
					</div>
					<div class="conj-cell">
						<span class="conj-verb">{displayPresent(presentInee)}</span>
						<span class="conj-pronoun">inee</span>
					</div>
					<div class="conj-cell">
						<span class="conj-verb">{displayPresent(presentIchek)}</span>
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
						<a href={dictionaryEntryHref(link.word)} class="related-word-card">
							<span class="related-word-heading">
								<span class="related-word-title">{link.word.kalenjin}</span>
								{#if link.word.partOfSpeech}
									<PartOfSpeechInline value={link.word.partOfSpeech} size="tiny" />
								{/if}
								{#if link.word.isSwahiliLoan}
									<SwahiliLoanIndicator compact />
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
					<div class="example sentence-card">
						<div class="kal">
							<TokenHoverPreview
								sentenceId={link.exampleSentence.id}
								sentenceText={link.exampleSentence.kalenjin}
								tokens={link.exampleSentence.tokens}
							/>
						</div>
						<a class="en sentence-card-link" href={`/corpus/${link.exampleSentence.id}`}>
							<SentenceTimeText text={link.exampleSentence.english} />
						</a>
					</div>
				{/each}
			{/if}
		</div>

		{#if editMode}
		<aside>
			<SidePanel title="Pronunciation">
					<AudioRecorder
						targetType="word"
						targetId={data.word.id}
						currentAudioUrl={data.word.audioUrl}
					/>
				</SidePanel>

				{#if showPlural}
					<SidePanel title="Plural pronunciation">
						<p class="plural-recorder-hint">
							For <em>{data.word.pluralForm}</em>.
						</p>
						<AudioRecorder
							targetType="word-plural"
							targetId={data.word.id}
							currentAudioUrl={data.word.pluralAudioUrl}
						/>
					</SidePanel>
				{/if}

				{#if showIncertain}
					<SidePanel title="Incertain pronunciation">
						<p class="plural-recorder-hint">
							For <em>{data.word.incertainForm}</em>.
						</p>
						<AudioRecorder
							targetType="word-incertain"
							targetId={data.word.id}
							currentAudioUrl={data.word.incertainAudioUrl}
						/>
					</SidePanel>
				{/if}

				<SidePanel title="Edit entry" extraClass={editEntryDirty ? 'side-card--dirty' : ''}>
					{#snippet actions()}
						<SwahiliLoanToggle form="word-edit-form" bind:checked={isSwahiliLoan} />
					{/snippet}
					<FormErrorFeedback error={form?.error} />

					<form
						id="word-edit-form"
						method="POST"
						action="?/update"
						enctype="multipart/form-data"
						use:enhance={() => {
							return async ({ update }) => {
								await update({ reset: false });
							};
						}}
					>
						<div class="side-field-grid side-field-grid--word">
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
								<label for="alternativeSpellings">Alt. Spellings</label>
								<input
									id="alternativeSpellings"
									name="alternativeSpellings"
									type="text"
									class="side-input"
									placeholder="Comma-separated"
									bind:value={altSpellingsValue}
								/>
							</div>
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
							{#if needsIncertainInput}
								<div class="side-field-grid">
									<div class="side-field">
										<label for="incertainForm">Inc. Singular</label>
										<input
											id="incertainForm"
											name="incertainForm"
											type="text"
											class="side-input"
											placeholder="e.g. inganan"
											disabled={isPluralOnly}
											bind:value={incertainFormValue}
										/>
									</div>
									<div class="side-field">
										<label for="alternativeIncertainForms">Alt. Incertain</label>
										<input
											id="alternativeIncertainForms"
											name="alternativeIncertainForms"
											type="text"
											class="side-input"
											placeholder="comma, separated"
											disabled={isPluralOnly}
											bind:value={alternativeIncertainFormsValue}
										/>
									</div>
								</div>
							{:else}
								<input type="hidden" name="incertainForm" value="" />
								<input type="hidden" name="alternativeIncertainForms" value="" />
							{/if}
							<div class="side-field-grid">
								<div class="side-field">
									<label for="pluralForm">Plural</label>
									<input
										id="pluralForm"
										name="pluralForm"
										type="text"
										class="side-input"
										placeholder="e.g. chego"
										disabled={isPluralOnly || isSingularOnly}
										bind:value={pluralFormValue}
									/>
								</div>
								<div class="side-field">
									<label for="alternativePluralForms">Alt. Plurals</label>
									<input
										id="alternativePluralForms"
										name="alternativePluralForms"
										type="text"
										class="side-input"
										placeholder="comma, separated"
										disabled={isPluralOnly || isSingularOnly}
										bind:value={alternativePluralFormsValue}
									/>
								</div>
							</div>
							<div class="form-only-toggles">
								<label class="plural-only-toggle">
									<input
										type="checkbox"
										name="isPluralOnly"
										bind:checked={isPluralOnly}
										onchange={() => {
											if (isPluralOnly) isSingularOnly = false;
										}}
									/>
									<span>Plural-only</span>
								</label>
								<label class="plural-only-toggle">
									<input
										type="checkbox"
										name="isSingularOnly"
										bind:checked={isSingularOnly}
										onchange={() => {
											if (isSingularOnly) isPluralOnly = false;
										}}
									/>
									<span>Singular-only</span>
								</label>
							</div>
						{:else}
							<input type="hidden" name="pluralForm" value="" />
							<input type="hidden" name="isPluralOnly" value="" />
							<input type="hidden" name="isSingularOnly" value="" />
							<input type="hidden" name="alternativePluralForms" value="" />
							<input type="hidden" name="incertainForm" value="" />
							<input type="hidden" name="alternativeIncertainForms" value="" />
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
								bind:dirty={imageDirty}
							/>
						</div>
						<div style="display: flex; gap: 8px; margin-top: 4px;">
							<button type="submit" class="btn-sm">Save</button>
						</div>
					</form>
				</SidePanel>

				<SidePanel title="Related words">
					<FormErrorFeedback error={form?.relatedWordError} />

					{#if data.word.relatedWords.length === 0}
						<p class="related-editor-empty">No related words linked.</p>
					{:else}
						<ul class="related-editor-list">
							{#each data.word.relatedWords as link (link.word.id)}
								<li>
									<a href={dictionaryEntryHref(link.word)}>
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
													{#if result.isSwahiliLoan}
														<SwahiliLoanIndicator compact />
													{/if}
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
				</SidePanel>

				<SidePanel title="Danger zone">
					<form method="POST" action="?/delete" onsubmit={requestDeleteEntry}>
						<button type="submit" class="btn-sm danger" style="width: 100%">Delete this entry</button>
					</form>
				</SidePanel>
		</aside>
		{/if}
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

<ConfirmDialog
	open={pendingDeleteForm !== null}
	title="Delete this entry?"
	message={`"${kalenjinValue || data.word.kalenjin}" will be permanently removed from the dictionary.`}
	confirmLabel="Delete entry"
	variant="danger"
	onconfirm={confirmPendingDelete}
	oncancel={cancelPendingDelete}
/>

<ReportDialog
	open={reportDialogOpen}
	targetType="WORD"
	targetId={data.word.id}
	targetLabel={kalenjinValue || data.word.kalenjin}
	onclose={() => (reportDialogOpen = false)}
/>

<style>
	.entry-top-actions {
		align-items: center;
		display: flex;
		gap: 8px;
	}
	.detail-shell-solo {
		grid-template-columns: minmax(0, 1fr);
	}
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
	.translations-list .trans-text {
		flex: 1;
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
	.entry-title-pills {
		align-items: center;
		display: inline-flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.side-field-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: 1fr 1fr;
	}
	.side-field-grid--word .side-field {
		margin-bottom: 0;
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

	/* Align the headword row on the main word's baseline via an inline formatting
	   context (flex baseline doesn't align a huge word with tiny siblings). The
	   form words and pills sit on teta's baseline; inc./pl. labels hang below;
	   the play button stays vertically centered. font-size:0 collapses the
	   whitespace between inline-block children so spacing is controlled by margin. */
	.entry-title {
		display: block;
		font-size: 0;
	}
	.entry-title h1 {
		display: inline-block;
		vertical-align: baseline;
	}
	.entry-title > :global(.audio-btn) {
		margin: 0 8px 0 14px;
		vertical-align: middle;
	}
	.entry-forms {
		align-items: baseline;
		display: inline-flex;
		flex-wrap: wrap;
		gap: 4px 20px;
		margin-left: 14px;
		vertical-align: baseline;
	}
	.entry-title-pills {
		margin-left: 16px;
		vertical-align: baseline;
	}
	.entry-form {
		cursor: default;
		display: inline-block;
		position: relative;
	}
	.entry-form-top {
		align-items: center;
		display: inline-flex;
		gap: 8px;
	}
	.entry-form-label-slot {
		left: 0;
		position: absolute;
		top: 100%;
	}
	.entry-form-word {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 500;
		line-height: 1.1;
		text-decoration: underline dotted color-mix(in oklch, var(--ink-mute) 55%, transparent);
		text-underline-offset: 4px;
	}
	.entry-form-label {
		color: var(--ink-mute);
		cursor: help;
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.04em;
		line-height: 1.2;
	}
	.plural-recorder-hint {
		color: var(--ink-mute);
		font-size: 13px;
		margin: 0 0 8px;
	}
	.plural-recorder-hint em {
		color: var(--ink);
		font-family: var(--font-display);
		font-style: normal;
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
	.form-only-toggles {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 20px;
		margin-top: 8px;
	}
	.plural-only-toggle {
		align-items: center;
		color: var(--ink-soft);
		display: inline-flex;
		font-size: 13px;
		gap: 8px;
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
