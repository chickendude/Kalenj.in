<script lang="ts">
	import { PART_OF_SPEECH_ABBREVIATIONS, PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import type { PartOfSpeech } from '@prisma/client';

	let {
		value,
		size = 'default'
	}: {
		value: PartOfSpeech;
		size?: 'default' | 'tiny';
	} = $props();

	const abbreviation = $derived(PART_OF_SPEECH_ABBREVIATIONS[value]);
	const fullLabel = $derived(PART_OF_SPEECH_LABELS[value].toLowerCase());
</script>

<abbr
	class:tiny={size === 'tiny'}
	class="pos-inline"
	aria-label={fullLabel}
	data-tooltip={fullLabel}
>
	{abbreviation}
</abbr>

<style>
	.pos-inline {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		margin: 0;
		padding: 0.2rem 0.46rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--bg-raised);
		color: var(--ink-soft);
		cursor: help;
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-style: normal;
		font-weight: 600;
		letter-spacing: 0.03em;
		line-height: 1;
		text-decoration: none;
		text-transform: lowercase;
		vertical-align: baseline;
	}

	.pos-inline::after {
		position: absolute;
		left: 50%;
		bottom: calc(100% + 0.35rem);
		transform: translateX(-50%);
		content: attr(data-tooltip);
		padding: 0.28rem 0.42rem;
		border-radius: 4px;
		background: var(--tooltip-bg);
		color: var(--tooltip-ink);
		font-family: var(--font-body);
		font-size: 0.74rem;
		font-weight: 500;
		letter-spacing: 0;
		line-height: 1.2;
		opacity: 0;
		pointer-events: none;
		text-transform: none;
		transition: opacity 0s linear;
		white-space: nowrap;
		z-index: 20;
	}

	.pos-inline:hover::after,
	.pos-inline:focus-visible::after {
		opacity: 1;
	}

	.pos-inline.tiny {
		font-size: 0.72rem;
	}
</style>
