<script lang="ts">
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import SentenceTokenAnnotations from '$lib/components/SentenceTokenAnnotations.svelte';
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';

	let { data, form } = $props();

	type SentenceToken = (typeof data.sentence.tokens)[number];

	const canEdit = $derived(data.user?.role === 'ADMIN' || data.user?.role === 'MANAGER');

	let pendingDeleteForm = $state<HTMLFormElement | null>(null);

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

	function handleTokensChange(tokens: unknown[]): void {
		sentenceTokens = (tokens as SentenceToken[]).map(cloneSentenceToken);
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
			<TokenHoverPreview
				sentenceId={data.sentence.id}
				sentenceText={data.sentence.kalenjin}
				tokens={displayedSentenceTokens}
			/>
		</div>
		<div class="sentence-english">{data.sentence.english}</div>
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
				sentenceText={data.sentence.kalenjin}
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
