<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';

	let { notes }: { notes: string } = $props();

	const html = $derived(renderMarkdown(notes));
</script>

<button type="button" class="notes-indicator" aria-label="Has notes">
	<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
		<path
			d="M4 2.5h6.2a1.3 1.3 0 0 1 1.3 1.3v8.4a1.3 1.3 0 0 1-1.3 1.3H5.8a1.3 1.3 0 0 1-1.3-1.3V3.8A1.3 1.3 0 0 1 5.8 2.5"
			stroke="currentColor"
			stroke-width="1.3"
			stroke-linejoin="round"
		/>
		<path
			d="M6.3 5.6h3.4M6.3 8h3.4M6.3 10.4h2.1"
			stroke="currentColor"
			stroke-width="1.3"
			stroke-linecap="round"
		/>
	</svg>
	<span class="notes-tooltip notes-markdown" role="tooltip">{@html html}</span>
</button>

<style>
	.notes-indicator {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		padding: 0.3rem;
		margin: -0.3rem;
		border: 0;
		background: none;
		color: var(--ink-soft);
		cursor: help;
		vertical-align: middle;
	}

	.notes-tooltip {
		position: absolute;
		left: 50%;
		bottom: calc(100% + 0.35rem);
		transform: translateX(-50%);
		width: max-content;
		max-width: 20rem;
		padding: 0.5rem 0.65rem;
		border-radius: 6px;
		background: var(--tooltip-bg);
		color: var(--tooltip-ink);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 500;
		line-height: 1.45;
		text-align: left;
		white-space: normal;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0s linear;
		z-index: 20;
	}

	.notes-indicator:hover .notes-tooltip,
	.notes-indicator:focus-visible .notes-tooltip {
		opacity: 1;
	}

	.notes-tooltip :global(p),
	.notes-tooltip :global(ul),
	.notes-tooltip :global(ol) {
		margin: 0 0 0.4rem;
	}
	.notes-tooltip :global(> :last-child) {
		margin-bottom: 0;
	}
	.notes-tooltip :global(ul),
	.notes-tooltip :global(ol) {
		padding-left: 1.1rem;
	}
	.notes-tooltip :global(a) {
		color: inherit;
		text-decoration: underline;
	}
	.notes-tooltip :global(code) {
		font-size: 0.92em;
	}
</style>
