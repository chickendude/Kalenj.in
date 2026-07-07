<script lang="ts">
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import LearnFeedbackActions from '$lib/components/learn/LearnFeedbackActions.svelte';
	import TokenHoverPreview from '$lib/components/TokenHoverPreview.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { onLearnShortcut } from '$lib/learn/shortcuts';
	import type { LearnSentence } from '$lib/learn/lesson-steps';

	let {
		sentence,
		speaker = null,
		grammarNotes = null,
		translationOverride = null,
		showFeedbackActions = false,
		autoplayAudio = false,
		translationRevealed = false
	}: {
		sentence: LearnSentence;
		speaker?: string | null;
		grammarNotes?: string | null;
		translationOverride?: string | null;
		showFeedbackActions?: boolean;
		autoplayAudio?: boolean;
		/** Show the translation immediately instead of behind a reveal button. */
		translationRevealed?: boolean;
	} = $props();

	// svelte-ignore state_referenced_locally — initial value, re-synced on sentence change below
	let revealed = $state(translationRevealed);
	let audioButton = $state<ReturnType<typeof AudioPlayButton> | null>(null);

	const translation = $derived(translationOverride?.trim() || sentence.english);

	// Reset the reveal when the sentence changes (steps reuse this component).
	$effect(() => {
		void sentence.id;
		revealed = translationRevealed;
	});

	$effect(() =>
		onLearnShortcut((action) => {
			if (action === 'audio') audioButton?.play();
			else if (action === 'translate') revealed = !revealed;
		})
	);
</script>

<div class="sentence-card">
	{#if speaker}
		<div class="speaker">{speaker}</div>
	{/if}
	<div class="sentence-line">
		<TokenHoverPreview
			sentenceId={sentence.id}
			sentenceText={sentence.kalenjin}
			tokens={sentence.tokens}
			onTokenClick={() => {}}
		>
			{#snippet leading()}
				<AudioPlayButton
					bind:this={audioButton}
					audioUrl={sentence.audioUrl}
					size="sm"
					label="Play sentence audio"
					autoplay={autoplayAudio}
				/>
			{/snippet}
		</TokenHoverPreview>
	</div>
	{#if sentence.imageUrl}
		<img class="sentence-image" src={sentence.imageUrl} alt="" loading="lazy" />
	{/if}
	{#if revealed}
		<div class="translation">
			<p class="translation-text">{translation}</p>
		</div>
		{#if grammarNotes?.trim()}
			<div class="grammar-notes">
				<!-- eslint-disable-next-line svelte/no-at-html-tags — renderMarkdown escapes HTML -->
				{@html renderMarkdown(grammarNotes)}
			</div>
		{/if}
	{:else}
		<button type="button" class="btn-sm ghost reveal-btn" onclick={() => (revealed = true)}>
			Show translation
		</button>
	{/if}
	{#if showFeedbackActions}
		<LearnFeedbackActions
			targetType="SENTENCE"
			targetId={sentence.id}
			targetLabel={`Sentence: ${sentence.kalenjin}`}
		/>
	{/if}
</div>

<style>
	.sentence-card {
		display: grid;
		gap: 0.9rem;
		justify-items: start;
		text-align: left;
	}

	.speaker {
		color: var(--ink-mute);
		font-size: 13px;
		font-style: italic;
	}

	.sentence-line {
		font-family: var(--font-display, inherit);
		font-size: 1.5rem;
		line-height: 1.6;
	}

	.sentence-image {
		border-radius: var(--radius-lg, 10px);
		max-height: 180px;
		max-width: 100%;
		object-fit: cover;
	}

	.translation {
		display: grid;
		gap: 0.2rem;
	}

	.translation-text {
		color: var(--ink-soft);
		font-size: 1.05rem;
		margin: 0;
	}

	.grammar-notes {
		border-left: 3px solid var(--accent);
		color: var(--ink-soft);
		font-size: 14px;
		line-height: 1.55;
		padding-left: 0.8rem;
	}

	.grammar-notes :global(p) {
		margin: 0.25rem 0;
	}

	.reveal-btn {
		margin-top: 0.2rem;
	}
</style>
