<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open,
		title,
		labelledBy = 'modal-title',
		busy = false,
		onclose,
		children
	}: {
		open: boolean;
		title: string;
		labelledBy?: string;
		busy?: boolean;
		onclose: () => void;
		children: Snippet;
	} = $props();

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget && !busy) {
			onclose();
		}
	}

	function handleKey(event: KeyboardEvent) {
		if (event.key === 'Escape' && !busy) {
			event.preventDefault();
			onclose();
		}
	}

	$effect(() => {
		if (!open) return;
		window.addEventListener('keydown', handleKey);
		return () => window.removeEventListener('keydown', handleKey);
	});
</script>

{#if open}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={handleBackdropClick}
	>
		<div
			class="modal-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby={labelledBy}
		>
			<div class="modal-head">
				<h2 id={labelledBy}>{title}</h2>
				<button
					type="button"
					class="modal-close"
					onclick={onclose}
					aria-label="Close"
					disabled={busy}>×</button>
			</div>
			{@render children()}
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		align-items: flex-start;
		background: rgba(15, 23, 42, 0.35);
		display: flex;
		inset: 0;
		justify-content: center;
		overflow-y: auto;
		padding: 3rem 1rem;
		position: fixed;
		z-index: 60;
	}

	.modal-dialog {
		background: var(--bg-raised, var(--paper));
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: 0 20px 45px rgba(15, 23, 42, 0.25);
		display: grid;
		gap: 1rem;
		max-width: 640px;
		padding: 1.25rem 1.5rem 1.5rem;
		width: 100%;
	}

	.modal-head {
		align-items: center;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	.modal-head h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.modal-close {
		background: transparent;
		border: 0;
		color: var(--ink-soft, #334155);
		cursor: pointer;
		font-size: 1.5rem;
		line-height: 1;
		padding: 0.25rem 0.5rem;
	}
	.modal-close:hover:not(:disabled) {
		color: var(--ink, #0f172a);
	}
	.modal-close:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
