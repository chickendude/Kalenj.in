<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';

	let { markdown, title = null }: { markdown: string; title?: string | null } = $props();

	const html = $derived(renderMarkdown(markdown));
</script>

<div class="grammar-card">
	<div class="grammar-kicker">Grammar</div>
	{#if title}
		<h2 class="grammar-title">{title}</h2>
	{/if}
	<div class="grammar-body">
		<!-- eslint-disable-next-line svelte/no-at-html-tags — renderMarkdown escapes HTML -->
		{@html html}
	</div>
</div>

<style>
	.grammar-card {
		display: grid;
		gap: 0.5rem;
		text-align: left;
	}

	.grammar-kicker {
		color: var(--accent);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.grammar-title {
		font-family: var(--font-display, inherit);
		font-size: 1.4rem;
		margin: 0;
	}

	.grammar-body {
		color: var(--ink);
		font-size: 15px;
		line-height: 1.65;
		max-width: 58ch;
	}

	.grammar-body :global(h1),
	.grammar-body :global(h2),
	.grammar-body :global(h3) {
		font-family: var(--font-display, inherit);
		line-height: 1.25;
		margin: 1rem 0 0.4rem;
	}

	.grammar-body :global(h1) {
		font-size: 1.35rem;
	}

	.grammar-body :global(h2) {
		font-size: 1.15rem;
	}

	.grammar-body :global(h3) {
		font-size: 1rem;
	}

	.grammar-body :global(p) {
		margin: 0.4rem 0;
	}

	.grammar-body :global(ul),
	.grammar-body :global(ol) {
		margin: 0.4rem 0;
		padding-left: 1.4rem;
	}

	.grammar-body :global(li) {
		margin: 0.2rem 0;
	}

	.grammar-body :global(code) {
		background: color-mix(in oklab, var(--line) 45%, transparent);
		border-radius: 4px;
		font-family: var(--font-mono, monospace);
		font-size: 0.88em;
		padding: 0.05em 0.3em;
	}

	.grammar-body :global(blockquote) {
		border-left: 3px solid var(--accent);
		color: var(--ink-soft);
		margin: 0.5rem 0;
		padding-left: 0.8rem;
	}

	.grammar-body :global(hr) {
		border: none;
		border-top: 1px solid var(--line);
		margin: 0.8rem 0;
	}
</style>
