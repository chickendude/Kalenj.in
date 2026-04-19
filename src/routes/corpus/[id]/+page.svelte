<script lang="ts">
	import SentenceTokenAnnotations from '$lib/components/SentenceTokenAnnotations.svelte';
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';

	let { data, form } = $props();

	type SentenceToken = (typeof data.sentence.tokens)[number];

	let sentenceTokens = $state<SentenceToken[]>([]);
	const displayedSentenceTokens = $derived(
		sentenceTokens.length > 0 ? sentenceTokens : data.sentence.tokens
	);
	let lastIncomingTokenSignature = $state('');

	$effect(() => {
		const incomingSignature = JSON.stringify(
			data.sentence.tokens.map((token) => ({
				id: token.id,
				surfaceForm: token.surfaceForm,
				wordId: token.wordId,
				inContextTranslation: token.inContextTranslation ?? null,
				wordKalenjin: token.word?.kalenjin ?? null,
				wordTranslations: token.word?.translations ?? null
			}))
		);

		if (incomingSignature !== lastIncomingTokenSignature) {
			sentenceTokens = data.sentence.tokens.map((token) => ({
				...token,
				word: token.word ? { ...token.word } : token.word
			}));
			lastIncomingTokenSignature = incomingSignature;
		}
	});

	function handleTokensChange(tokens: unknown[]): void {
		sentenceTokens = (tokens as SentenceToken[]).map((token) => ({
			...token,
			word: token.word ? { ...token.word } : token.word
		}));
	}
</script>

<svelte:head>
	<title>Token mapping — Kalenj.in</title>
</svelte:head>

<section>
	<a href="/corpus" class="back-link">
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
			<path d="M7.5 2L3 6l4.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
		Back to corpus
	</a>

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
		{#if data.sentence.source}
			<div class="sentence-source">{data.sentence.source}</div>
		{/if}
	</div>

	{#if form?.error}
		<div class="form-feedback error">{form.error}</div>
	{:else if form?.updateCorpusSentenceTokenSuccess}
		<div class="form-feedback success">Saved sentence annotation.</div>
	{:else if form?.createCorpusSentenceWordSuccess}
		<div class="form-feedback success">Created lemma and linked it.</div>
	{/if}

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
</section>

<style>
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

	.sentence-source {
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
