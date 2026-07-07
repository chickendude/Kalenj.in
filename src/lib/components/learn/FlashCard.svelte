<script lang="ts">
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import { stripWordLinks } from '$lib/word-links';

	let {
		front,
		back,
		audioUrl = null,
		onRevealed
	}: {
		/** English prompt. */
		front: string;
		/** Kalenjin answer. */
		back: string;
		audioUrl?: string | null;
		onRevealed: () => void;
	} = $props();

	let revealed = $state(false);

	function reveal() {
		revealed = true;
		onRevealed();
	}
</script>

<div class="flashcard">
	<div class="flash-kicker">What's the Kalenjin for…</div>
	<p class="flash-front">{stripWordLinks(front)}</p>

	{#if revealed}
		<div class="flash-back">
			<span class="flash-answer">{back}</span>
			<AudioPlayButton {audioUrl} size="sm" label="Play pronunciation" />
		</div>
	{:else}
		<button type="button" class="btn" onclick={reveal}>Show answer</button>
	{/if}
</div>

<style>
	.flashcard {
		display: grid;
		gap: 1rem;
		justify-items: center;
		padding: 1.5rem 0;
		text-align: center;
	}

	.flash-kicker {
		color: var(--ink-mute);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.flash-front {
		color: var(--ink);
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0;
	}

	.flash-back {
		align-items: center;
		display: flex;
		gap: 0.7rem;
	}

	.flash-answer {
		color: var(--brand);
		font-family: var(--font-display, inherit);
		font-size: 2rem;
		font-weight: 600;
	}
</style>
