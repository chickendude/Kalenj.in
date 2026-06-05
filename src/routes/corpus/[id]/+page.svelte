<script lang="ts">
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import AudioRecorder from '$lib/components/AudioRecorder.svelte';
	import BackLink from '$lib/components/BackLink.svelte';
	import ClickToEditText from '$lib/components/ClickToEditText.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import EditModeToggle from '$lib/components/EditModeToggle.svelte';
	import ReportDialog from '$lib/components/ReportDialog.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import SentenceStatusToggle from '$lib/components/SentenceStatusToggle.svelte';
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';
	import StoryLinksIndicator from '$lib/components/StoryLinksIndicator.svelte';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import ImageUploadField from '$lib/components/ImageUploadField.svelte';
	import SentenceTokenAnnotations from '$lib/components/SentenceTokenAnnotations.svelte';
	import TokenHoverPreview from '$lib/components/TokenHoverPreview.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { enhance } from '$app/forms';
	import { renderMarkdown } from '$lib/markdown';
	import { getEditMode } from '$lib/stores/editMode.svelte';

	let { data, form } = $props();

	$effect(() => {
		if (form?.updateCorpusSentenceTokenSuccess) toast.success('Saved sentence annotation.');
	});
	$effect(() => {
		if (form?.createCorpusSentenceWordSuccess) toast.success('Created lemma and linked it.');
	});
	$effect(() => {
		if (form?.updateSentenceImageSuccess) toast.success('Image updated.');
	});
	$effect(() => {
		if (form?.autoLemmaSuccess) toast.success(form.autoLemmaSuccess);
	});
	$effect(() => {
		if (form?.setSentenceStatusSuccess) {
			const labels = {
				NEEDS_PROOFREAD: 'Needs proofread',
				IN_CORPUS: 'Proofread',
				STORY_ONLY: 'Story only'
			} as const;
			toast.success(`Status set to "${labels[form.status]}".`);
		}
	});
	$effect(() => {
		if (form?.error) toast.error(form.error);
	});

	type SentenceToken = (typeof data.sentence.tokens)[number];
	type InlineSentenceField = 'kalenjin' | 'notes';
	type SentenceInlineField = InlineSentenceField | 'english';

	const editModeCtx = getEditMode();
	const isStaff = $derived(data.user?.role === 'ADMIN' || data.user?.role === 'MANAGER');
	const canEdit = $derived(isStaff && editModeCtx.value);
	const canSeeStoryLinks = $derived(data.user?.role === 'ADMIN' && editModeCtx.value);

	let pendingDeleteForm = $state<HTMLFormElement | null>(null);
	let autoLemmaForm = $state<HTMLFormElement | null>(null);
	let pendingAutoLemmaForm = $state<HTMLFormElement | null>(null);
	let autoLemmaConfirmed = $state(false);
	let reportDialogOpen = $state(false);
	let inlineSentenceEdit = $state<InlineSentenceField | null>(null);
	let inlineSentenceValue = $state('');
	let inlineSentenceError = $state<string | null>(null);
	let inlineSentenceInput = $state<HTMLTextAreaElement | null>(null);
	let inlineSentenceEditorHeight = $state<number | null>(null);
	let kalenjinDisplayShell = $state<HTMLDivElement | null>(null);
	let notesDisplayShell = $state<HTMLDivElement | null>(null);
	// Seed from the loaded data so SSR renders the actual sentence/translation
	// from the first paint — otherwise the page reflows on hydration when the
	// effect below copies the values in. The effect handles subsequent updates
	// when `data.sentence` changes (e.g., after a save + invalidate).
	let sentenceKalenjin = $state(untrack(() => data.sentence.kalenjin));
	let sentenceEnglish = $state(untrack(() => data.sentence.english));
	let sentenceNotes = $state(untrack(() => data.sentence.notes ?? ''));

	let sentenceTokens = $state<SentenceToken[]>([]);
	const displayedSentenceTokens = $derived(
		sentenceTokens.length > 0 ? sentenceTokens : data.sentence.tokens
	);
	let lastIncomingTokenSignature = $state('');

	function cloneSentenceToken(token: SentenceToken): SentenceToken {
		return {
			...token,
			word: token.word ? { ...token.word } : token.word,
			segments: token.segments.map((segment) => ({
				...segment,
				word: segment.word ? { ...segment.word } : segment.word
			}))
		};
	}

	$effect(() => {
		const incomingSignature = JSON.stringify(
			data.sentence.tokens.map((token) => ({
				id: token.id,
				surfaceForm: token.surfaceForm,
				wordId: token.wordId,
				inContextTranslation: token.inContextTranslation ?? null,
				wordKalenjin: token.word?.kalenjin ?? null,
				wordTranslations: token.word?.translations ?? null,
				segments: token.segments.map((segment) => ({
					id: segment.id,
					surfaceForm: segment.surfaceForm,
					wordId: segment.wordId,
					wordKalenjin: segment.word?.kalenjin ?? null,
					wordTranslations: segment.word?.translations ?? null
				}))
			}))
		);

		if (incomingSignature !== lastIncomingTokenSignature) {
			sentenceTokens = data.sentence.tokens.map(cloneSentenceToken);
			lastIncomingTokenSignature = incomingSignature;
		}
	});

	$effect(() => {
		sentenceKalenjin = data.sentence.kalenjin;
		sentenceEnglish = data.sentence.english;
		sentenceNotes = data.sentence.notes ?? '';
	});

	$effect(() => {
		if (!inlineSentenceEdit) return;

		const timeout = window.setTimeout(() => {
			inlineSentenceInput?.focus();
			inlineSentenceInput?.select();
		}, 0);

		return () => window.clearTimeout(timeout);
	});

	function handleTokensChange(tokens: unknown[]): void {
		sentenceTokens = (tokens as SentenceToken[]).map(cloneSentenceToken);
	}

	function beginInlineSentenceEdit(field: InlineSentenceField) {
		if (!canEdit) return;
		inlineSentenceEditorHeight =
			field === 'kalenjin'
				? kalenjinDisplayShell?.offsetHeight ?? null
				: notesDisplayShell?.offsetHeight ?? null;
		inlineSentenceEdit = field;
		inlineSentenceValue = field === 'kalenjin' ? sentenceKalenjin : sentenceNotes;
		inlineSentenceError = null;
	}

	function cancelInlineSentenceEdit() {
		inlineSentenceEdit = null;
		inlineSentenceValue = '';
		inlineSentenceError = null;
		inlineSentenceEditorHeight = null;
	}

	async function updateSentenceInline(field: SentenceInlineField, value: string) {
		const response = await fetch(`/corpus/${data.sentence.id}/sentence-inline`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ field, value })
		});
		const result = (await response.json()) as {
			message?: string;
			sentence?: {
				id: string;
				kalenjin: string;
				english: string;
				notes: string | null;
				tokens: SentenceToken[];
			};
		};

		if (!response.ok || !result.sentence) {
			throw new Error(result.message ?? 'Could not save sentence.');
		}

		sentenceKalenjin = result.sentence.kalenjin;
		sentenceEnglish = result.sentence.english;
		sentenceNotes = result.sentence.notes ?? '';
		sentenceTokens = result.sentence.tokens.map(cloneSentenceToken);

		if (field === 'kalenjin') {
			await invalidateAll();
		}
	}

	async function saveSentenceEnglish(value: string) {
		await updateSentenceInline('english', value);
	}

	async function saveInlineSentenceEdit() {
		if (!inlineSentenceEdit) return;

		const field = inlineSentenceEdit;
		const trimmedValue = inlineSentenceValue.trim();
		const currentValue = field === 'kalenjin' ? sentenceKalenjin : sentenceNotes;

		if (field !== 'notes' && !trimmedValue) {
			inlineSentenceError = 'Sentence is required.';
			return;
		}

		if (trimmedValue === currentValue) {
			cancelInlineSentenceEdit();
			return;
		}

		try {
			await updateSentenceInline(field, trimmedValue);
			cancelInlineSentenceEdit();
		} catch (saveError) {
			inlineSentenceError =
				saveError instanceof Error ? saveError.message : 'Could not save sentence.';
		}
	}

	function handleInlineSentenceKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void saveInlineSentenceEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelInlineSentenceEdit();
		}
	}

	function saveInlineSentenceEditOnBlur() {
		void saveInlineSentenceEdit();
	}

	function requestDeleteSentence(event: SubmitEvent) {
		if (pendingDeleteForm === event.currentTarget) {
			return;
		}
		event.preventDefault();
		pendingDeleteForm = event.currentTarget as HTMLFormElement;
	}

	function requestAutoLemma(event: SubmitEvent) {
		if (autoLemmaConfirmed) {
			autoLemmaConfirmed = false;
			return;
		}
		event.preventDefault();
		pendingAutoLemmaForm = event.currentTarget as HTMLFormElement;
	}

	function openAutoLemmaDialog() {
		pendingAutoLemmaForm = autoLemmaForm;
	}

	function cancelPendingDelete() {
		pendingDeleteForm = null;
	}

	function cancelPendingAutoLemma() {
		pendingAutoLemmaForm = null;
	}

	function confirmPendingDelete() {
		if (!pendingDeleteForm) return;
		const form = pendingDeleteForm;
		pendingDeleteForm = null;
		form.submit();
	}

	function confirmPendingAutoLemma() {
		if (!pendingAutoLemmaForm) return;
		const form = pendingAutoLemmaForm;
		pendingAutoLemmaForm = null;
		autoLemmaConfirmed = true;
		form.requestSubmit();
	}
</script>

<svelte:head>
	<title>Token mapping — Kalenj.in</title>
</svelte:head>

<section>
	<div class="detail-top-row">
		<div class="entry-nav-meta">
			<BackLink href="/corpus" label="Back to corpus" />
			<div class="entry-label-row">
				<div class="entry-label">Corpus sentence</div>
				<SentenceStatusToggle status={data.sentence.status} {canEdit} />
				{#if canSeeStoryLinks}
					<StoryLinksIndicator storyLinks={data.sentence.storyLinks} />
				{/if}
			</div>
		</div>
		<div class="sentence-admin-actions">
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
			{#if canEdit}
				<form
					bind:this={autoLemmaForm}
					method="POST"
					action="?/autoLemmatizeSentence"
					class="sentence-action-form"
					use:enhance={() => async ({ update }) => update({ reset: false })}
					onsubmit={requestAutoLemma}
				>
					<Tooltip label="Auto-fill missing lemmas">
						<button
							type="button"
							class="icon-action-btn"
							onclick={openAutoLemmaDialog}
							aria-label="Auto-fill missing lemmas"
						>
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0L19 11Z" />
								<path d="m5 2 5 5" />
								<path d="M2 13h15" />
								<path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" />
							</svg>
						</button>
					</Tooltip>
				</form>
				<form
					method="POST"
					action="?/deleteSentence"
					class="sentence-action-form"
					onsubmit={requestDeleteSentence}
				>
					<Tooltip label="Delete sentence">
						<button
							type="submit"
							class="icon-action-btn danger"
							aria-label="Delete sentence"
						>
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<polyline points="3 6 5 6 21 6" />
								<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
								<path d="M10 11v6" />
								<path d="M14 11v6" />
								<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
							</svg>
						</button>
					</Tooltip>
				</form>
			{/if}
			{#if isStaff}
				<div class="edit-toggle-slot">
					<EditModeToggle />
				</div>
			{/if}
		</div>
	</div>

	<div class="entry-head">
		<div class="sentence-display">
			{#if inlineSentenceEdit === 'kalenjin'}
				<textarea
					bind:this={inlineSentenceInput}
					class="inline-sentence-input sentence-display-input"
					rows="2"
					style:min-height={inlineSentenceEditorHeight ? `${inlineSentenceEditorHeight}px` : undefined}
					bind:value={inlineSentenceValue}
					onkeydown={handleInlineSentenceKeydown}
					onblur={saveInlineSentenceEditOnBlur}
				></textarea>
			{:else if canEdit}
				<div
					bind:this={kalenjinDisplayShell}
					class="editable-sentence-shell"
					role="button"
					tabindex="0"
					aria-label="Edit original sentence"
					onclick={() => beginInlineSentenceEdit('kalenjin')}
					onkeydown={(event) => {
						// Only handle key events targeted at the shell itself, so
						// Space/Enter on the wrapped AudioPlayButton (or token
						// buttons) keeps its native click behavior instead of
						// being hijacked into starting an edit.
						if (event.target !== event.currentTarget) return;
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							beginInlineSentenceEdit('kalenjin');
						}
					}}
				>
					<TokenHoverPreview
						sentenceId={data.sentence.id}
						sentenceText={sentenceKalenjin}
						tokens={displayedSentenceTokens}
						onTokenClick={() => beginInlineSentenceEdit('kalenjin')}
					>
						{#snippet leading()}
							<AudioPlayButton
								audioUrl={data.sentence.audioUrl}
								label="Play sentence"
							/>
						{/snippet}
					</TokenHoverPreview>
				</div>
			{:else}
				<TokenHoverPreview
					sentenceId={data.sentence.id}
					sentenceText={sentenceKalenjin}
					tokens={displayedSentenceTokens}
				>
					{#snippet leading()}
						<AudioPlayButton
							audioUrl={data.sentence.audioUrl}
							label="Play sentence"
						/>
					{/snippet}
				</TokenHoverPreview>
			{/if}
		</div>
		<div class="sentence-english">
			{#if canEdit}
				<ClickToEditText
					value={sentenceEnglish}
					label="English translation"
					rows={2}
					requiredMessage="Translation is required."
					preserveHeight
					onSave={saveSentenceEnglish}
				>
					{#if sentenceEnglish}
						<SentenceTimeText text={sentenceEnglish} />
					{:else}
						<span class="sentence-english-placeholder">Add translation...</span>
					{/if}
				</ClickToEditText>
			{:else}
				<SentenceTimeText text={sentenceEnglish} />
			{/if}
		</div>
		{#if inlineSentenceError}
			<p class="error-text">{inlineSentenceError}</p>
		{/if}
		<div class="sentence-notes-row">
			{#if inlineSentenceEdit === 'notes'}
				<textarea
					bind:this={inlineSentenceInput}
					class="inline-sentence-input sentence-notes-input"
					rows="2"
					style:min-height={inlineSentenceEditorHeight ? `${inlineSentenceEditorHeight}px` : undefined}
					bind:value={inlineSentenceValue}
					onkeydown={handleInlineSentenceKeydown}
					onblur={saveInlineSentenceEditOnBlur}
				></textarea>
			{:else if canEdit}
				<div
					bind:this={notesDisplayShell}
					class="inline-edit-button editable-notes-shell"
					class:is-empty={!sentenceNotes}
					role="button"
					tabindex="0"
					aria-label="Edit notes"
					onclick={(event) => {
						if ((event.target as HTMLElement).closest('a')) return;
						beginInlineSentenceEdit('notes');
					}}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							beginInlineSentenceEdit('notes');
						}
					}}
				>
					{#if sentenceNotes}
						<div class="notes-markdown sentence-notes">{@html renderMarkdown(sentenceNotes)}</div>
					{:else}
						<span class="sentence-notes-placeholder">Add notes…</span>
					{/if}
				</div>
			{:else if sentenceNotes}
				<div class="notes-markdown sentence-notes">{@html renderMarkdown(sentenceNotes)}</div>
			{/if}
		</div>
		{#if data.sentence.imageUrl}
			<img src={data.sentence.imageUrl} alt="" class="sentence-image" />
		{/if}
	</div>

	{#if canEdit}
		<section class="sentence-audio-panel">
			<h2 class="section-title">Pronunciation</h2>
			<AudioRecorder
				targetType="sentence"
				targetId={data.sentence.id}
				currentAudioUrl={data.sentence.audioUrl}
			/>
		</section>
	{/if}


	{#if canEdit}
		<h2 class="section-title">Image</h2>
		<form
			method="POST"
			action="?/updateSentenceImage"
			enctype="multipart/form-data"
			class="image-form"
			use:enhance={() => async ({ update }) => update({ reset: false })}
		>
			<ImageUploadField
				currentUrl={data.sentence.imageUrl}
				idPrefix="sentence-image"
				label="Sentence image"
			/>
			<button type="submit" class="btn-sm">Save image</button>
		</form>
	{/if}

	{#if canEdit}
		<h2 class="section-title">Token mapping</h2>
		<p class="hint">Click a word below to link a lemma, edit meaning, or split and combine words.</p>

		<div class="sentence-annotation-panel">
			<SentenceTokenAnnotations
				entityId={data.sentence.id}
				entityIdField="sentenceId"
				entityKind="example"
				sentenceId={data.sentence.id}
				sentenceText={sentenceKalenjin}
				tokens={displayedSentenceTokens}
				dictionaryWords={data.words}
				ignoredNormalizedForms={data.ignoredNormalizedForms}
				updateAction="?/updateCorpusSentenceToken"
				createAction="?/createCorpusSentenceWord"
				searchEndpoint={`/corpus/${data.sentence.id}/word-search`}
				tokenGroupEndpoint={`/corpus/${data.sentence.id}/token-groups`}
				onTokensChange={handleTokensChange}
			/>
		</div>
	{/if}
</section>

<ConfirmDialog
	open={pendingDeleteForm !== null}
	title="Delete sentence?"
	message="This sentence, its token mappings, and its lemma links will be removed. Dictionary entries stay."
	confirmLabel="Delete sentence"
	variant="danger"
	onconfirm={confirmPendingDelete}
	oncancel={cancelPendingDelete}
/>

<ConfirmDialog
	open={pendingAutoLemmaForm !== null}
	title="Auto-fill missing lemmas?"
	message="This will add in missing root forms and translations for this sentence. If anything changes, the sentence will be queued for proofread."
	confirmLabel="Auto-fill missing lemmas"
	onconfirm={confirmPendingAutoLemma}
	oncancel={cancelPendingAutoLemma}
/>

<ReportDialog
	open={reportDialogOpen}
	targetType="SENTENCE"
	targetId={data.sentence.id}
	targetLabel={sentenceKalenjin || data.sentence.kalenjin}
	onclose={() => (reportDialogOpen = false)}
/>

<style>
	.entry-nav-meta {
		display: grid;
		gap: 0.2rem;
	}
	.sentence-admin-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
	}
	.sentence-action-form {
		margin: 0;
	}
	/* Visually separate the edit-mode toggle from the destructive icon so it's
	   harder to misclick. */
	.edit-toggle-slot {
		align-items: center;
		display: inline-flex;
		margin-left: 12px;
	}
	.entry-label-row {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.entry-label-row .entry-label {
		line-height: 1;
		margin-bottom: 0;
	}
	.sentence-display {
		font-family: var(--font-display);
		font-size: 28px;
		line-height: 1.4;
		margin: 4px 0 6px;
	}

	.sentence-english {
		color: var(--ink-soft);
		font-size: 15px;
		margin-bottom: 4px;
	}

	.editable-sentence-shell {
		cursor: text;
	}

	.inline-edit-button:hover,
	.inline-edit-button:focus-visible,
	.editable-sentence-shell:hover,
	.editable-sentence-shell:focus-within {
		background: var(--surface);
		border-radius: var(--radius);
	}

	.inline-sentence-input {
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-sizing: border-box;
		color: var(--ink);
		font: inherit;
		line-height: inherit;
		margin: 0;
		min-height: 100%;
		overflow: hidden;
		padding: 0.45rem 0.55rem;
		resize: none;
		width: 100%;
	}

	.sentence-display-input {
		font-family: var(--font-display);
		font-size: 28px;
	}

	.inline-sentence-input:focus {
		border-color: var(--brand);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--brand) 18%, transparent);
		outline: none;
	}

	.sentence-notes-row {
		margin-top: 2px;
	}

	.sentence-english-placeholder {
		color: var(--ink-faint, var(--ink-mute));
	}

	.sentence-notes {
		color: var(--ink-mute);
		font-size: 13px;
	}

	.editable-notes-shell {
		color: var(--ink-mute);
		cursor: text;
		display: block;
		font: inherit;
		font-size: 13px;
		text-align: left;
		width: 100%;
	}

	.editable-notes-shell.is-empty {
		opacity: 0.7;
	}

	.sentence-notes-placeholder {
		color: var(--ink-faint, var(--ink-mute));
	}

	.sentence-notes-input {
		font-size: 13px;
	}

	.notes-markdown :global(p) {
		margin: 0 0 0.4em;
	}
	.notes-markdown :global(p:last-child) {
		margin-bottom: 0;
	}
	.notes-markdown :global(ul),
	.notes-markdown :global(ol) {
		margin: 0 0 0.4em;
		padding-left: 1.4em;
	}
	.notes-markdown :global(li) {
		margin: 0.1em 0;
	}
	.notes-markdown :global(code) {
		background: rgba(128, 128, 128, 0.15);
		padding: 1px 4px;
		border-radius: 3px;
		font-size: 0.9em;
		font-style: normal;
	}
	.notes-markdown :global(blockquote) {
		margin: 0.4em 0;
		padding-left: 10px;
		border-left: 3px solid rgba(128, 128, 128, 0.4);
	}
	.notes-markdown :global(a) {
		color: inherit;
		text-decoration: underline;
	}

	.sentence-image {
		display: block;
		max-width: 320px;
		max-height: 240px;
		object-fit: contain;
		border: 1px solid var(--line);
		border-radius: 8px;
		margin: 10px 0 4px;
		background: var(--bg-raised);
	}

	.image-form {
		align-items: flex-start;
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 20px;
	}

	.hint {
		color: var(--ink-mute);
		font-size: 13px;
		margin: -8px 0 16px;
	}

	.sentence-annotation-panel {
		border-top: 1px solid var(--line-soft);
		padding-top: 16px;
	}

	.sentence-audio-panel {
		margin-top: 16px;
	}
</style>
