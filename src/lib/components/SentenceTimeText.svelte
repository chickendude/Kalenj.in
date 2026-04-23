<script lang="ts">
	import { annotateSentenceTimes } from '$lib/time-annotations';

	let { text }: { text: string } = $props();

	const parts = $derived(annotateSentenceTimes(text));
</script>

<span class="sentence-time-text">
	{#each parts as part, index (`${part.type}:${index}`)}
		{#if part.type === 'text'}
			{part.text}
		{:else}
			<span class="sentence-time-mark">
				{part.text}<span class="sentence-time-tooltip" role="tooltip">
					<strong>{part.annotation.westernTime}</strong>
					<span>{part.annotation.note}</span>
				</span>
			</span>
		{/if}
	{/each}
</span>

<style>
	.sentence-time-text {
		display: inline;
	}

	.sentence-time-mark {
		cursor: help;
		position: relative;
		text-decoration-color: var(--accent);
		text-decoration-line: underline;
		text-decoration-style: dotted;
		text-decoration-thickness: 2px;
		text-underline-offset: 0.18em;
	}

	.sentence-time-tooltip {
		background: var(--tooltip-bg);
		border-radius: 0.45rem;
		bottom: calc(100% + 0.35rem);
		color: var(--tooltip-ink);
		display: none;
		font-size: 0.82rem;
		gap: 0.18rem;
		left: 50%;
		max-width: min(20rem, 75vw);
		min-width: 12rem;
		padding: 0.45rem 0.55rem;
		pointer-events: none;
		position: absolute;
		transform: translateX(-50%);
		white-space: normal;
		z-index: 30;
	}

	.sentence-time-mark:hover .sentence-time-tooltip {
		display: grid;
	}
</style>
