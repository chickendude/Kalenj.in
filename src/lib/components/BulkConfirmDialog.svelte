<script lang="ts">
	import type { Snippet } from 'svelte';

	// Shared modal shell for the BulkAudioRecorder confirmation dialogs. Owns the
	// backdrop, the dialog chrome, and click-outside / Escape dismissal. The body
	// (heading, message, actions) is passed in as a snippet so each caller keeps
	// its own content and state.
	let {
		open,
		labelledby,
		onclose,
		children
	}: {
		open: boolean;
		labelledby: string;
		onclose: () => void;
		children: Snippet;
	} = $props();
</script>

{#if open}
	<div
		class="confirm-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) onclose();
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') onclose();
		}}
	>
		<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={labelledby}>
			{@render children()}
		</div>
	</div>
{/if}

<style>
	.confirm-backdrop {
		align-items: center;
		background: rgba(15, 23, 42, 0.5);
		display: flex;
		inset: 0;
		justify-content: center;
		padding: 1rem;
		position: fixed;
		z-index: 80;
	}
	.confirm-dialog {
		background: var(--bg-raised, var(--paper));
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: 0 20px 45px rgba(15, 23, 42, 0.25);
		max-width: 420px;
		padding: 1.25rem 1.5rem 1.5rem;
		width: 100%;
	}
	/* The heading/message live in the caller's snippet (parent scope), so reach
	   them with :global within the dialog wrapper. */
	.confirm-dialog :global(h3) {
		margin: 0 0 8px 0;
	}
	.confirm-dialog :global(p) {
		margin: 0 0 4px 0;
		color: var(--ink-soft);
	}
</style>
