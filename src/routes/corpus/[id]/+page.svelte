<script lang="ts">
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';
	import SentenceTokenAnnotations from '$lib/components/SentenceTokenAnnotations.svelte';
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data, form } = $props();

	type SentenceToken = (typeof data.sentence.tokens)[number];
	type InlineSentenceField = 'kalenjin' | 'english';

	const canEdit = $derived(data.user?.role === 'ADMIN' || data.user?.role === 'MANAGER');

	let pendingDeleteForm = $state<HTMLFormElement | null>(null);
	let inlineSentenceEdit = $state<InlineSentenceField | null>(null);
	let inlineSentenceValue = $state('');
	let inlineSentenceError = $state<string | null>(null);
	let inlineSentenceInput = $state<HTMLTextAreaElement | null>(null);
	let inlineSentenceEditorHeight = $state<number | null>(null);
	let kalenjinDisplayShell = $state<HTMLDivElement | null>(null);
	let englishDisplayShell = $state<HTMLButtonElement | null>(null);
	let sentenceKalenjin = $state('');
	let sentenceEnglish = $state('');

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
				: englishDisplayShell?.offsetHeight ?? null;
		inlineSentenceEdit = field;
		inlineSentenceValue = field === 'kalenjin' ? sentenceKalenjin : sentenceEnglish;
		inlineSentenceError = null;
	}

	function cancelInlineSentenceEdit() {
		inlineSentenceEdit = null;
		inlineSentenceValue = '';
		inlineSentenceError = null;
		inlineSentenceEditorHeight = null;
	}

	async function saveInlineSentenceEdit() {
		if (!inlineSentenceEdit) return;

		const field = inlineSentenceEdit;
		const trimmedValue = inlineSentenceValue.trim();
		const currentValue = field === 'kalenjin' ? sentenceKalenjin : sentenceEnglish;

		if (!trimmedValue) {
			inlineSentenceError = field === 'kalenjin' ? 'Sentence is required.' : 'Translation is required.';
			return;
		}

		if (trimmedValue === currentValue) {
			cancelInlineSentenceEdit();
			return;
		}

		try {
			const response = await fetch(`/corpus/${data.sentence.id}/sentence-inline`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ field, value: trimmedValue })
			});
			const result = (await response.json()) as {
				error?: string;
				sentence?: {
					id: string;
					kalenjin: string;
					english: string;
					tokens: SentenceToken[];
				};
			};

			if (!response.ok || !result.sentence) {
				throw new Error(result.error ?? 'Could not save sentence.');
			}

			sentenceKalenjin = result.sentence.kalenjin;
			sentenceEnglish = result.sentence.english;
			sentenceTokens = result.sentence.tokens.map(cloneSentenceToken);
			cancelInlineSentenceEdit();

			if (field === 'kalenjin') {
				await invalidateAll();
			}
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

	function cancelPendingDelete() {
		pendingDeleteForm = null;
	}

	function confirmPendingDelete() {
		if (!pendingDeleteForm) return;
		const form = pendingDeleteForm;
		pendingDeleteForm = null;
		form.submit();
	}
</script>

<svelte:head>
	<title>Token mapping — Kalenj.in</title>
</svelte:head>

<section>
	<div class="entry-head-row">
		<a href="/corpus" class="back-link">
			<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
				<path d="M7.5 2L3 6l4.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			Back to corpus
		</a>
		{#if canEdit}
			<form
				method="POST"
				action="?/deleteSentence"
				class="sentence-delete-form"
				onsubmit={requestDeleteSentence}
			>
				<button type="submit" class="btn-sm danger">Delete sentence</button>
			</form>
		{/if}
	</div>

	<div class="entry-head">
		<div class="entry-label">Corpus sentence</div>
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
					/>
				</div>
			{:else}
				<TokenHoverPreview
					sentenceId={data.sentence.id}
					sentenceText={sentenceKalenjin}
					tokens={displayedSentenceTokens}
				/>
			{/if}
		</div>
		<div class="sentence-english">
			{#if inlineSentenceEdit === 'english'}
				<textarea
					bind:this={inlineSentenceInput}
					class="inline-sentence-input sentence-english-input"
					rows="2"
					style:min-height={inlineSentenceEditorHeight ? `${inlineSentenceEditorHeight}px` : undefined}
					bind:value={inlineSentenceValue}
					onkeydown={handleInlineSentenceKeydown}
					onblur={saveInlineSentenceEditOnBlur}
				></textarea>
			{:else if canEdit}
				<button
					bind:this={englishDisplayShell}
					type="button"
					class="inline-edit-button sentence-english-button"
					onclick={() => beginInlineSentenceEdit('english')}
				>
					<SentenceTimeText text={sentenceEnglish} />
				</button>
			{:else}
				<SentenceTimeText text={sentenceEnglish} />
			{/if}
		</div>
		{#if inlineSentenceError}
			<p class="error-text">{inlineSentenceError}</p>
		{/if}
		{#if data.sentence.notes}
			<div class="sentence-notes">{data.sentence.notes}</div>
		{/if}
	</div>

	{#if form?.error}
		<div class="form-feedback error">{form.error}</div>
	{:else if form?.updateCorpusSentenceTokenSuccess}
		<div class="form-feedback success">Saved sentence annotation.</div>
	{:else if form?.createCorpusSentenceWordSuccess}
		<div class="form-feedback success">Created lemma and linked it.</div>
	{/if}

	{#if data.user}
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

<style>
	.entry-head-row {
		align-items: center;
		display: flex;
		gap: 12px;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	.sentence-delete-form {
		margin: 0;
	}

	.sentence-display {
		font-family: var(--font-display);
		font-size: 28px;
		line-height: 1.4;
		margin: 12px 0 6px;
	}

	.sentence-english {
		color: var(--ink-soft);
		font-size: 15px;
		margin-bottom: 4px;
	}

	.editable-sentence-shell {
		cursor: text;
	}

	.sentence-english-button {
		background: transparent;
		border: 0;
		color: inherit;
		cursor: text;
		font: inherit;
		margin: 0;
		padding: 0;
		text-align: left;
		width: 100%;
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

	.sentence-english-input {
		font-size: 15px;
	}

	.inline-sentence-input:focus {
		border-color: var(--brand);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--brand) 18%, transparent);
		outline: none;
	}

	.sentence-notes {
		color: var(--ink-mute);
		font-size: 13px;
		font-style: italic;
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
</style>
