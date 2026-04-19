<script lang="ts">
	type ConfirmVariant = 'primary' | 'danger';

	let {
		open,
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		variant = 'primary',
		onconfirm,
		oncancel
	}: {
		open: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		variant?: ConfirmVariant;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();

	let confirmButton = $state<HTMLButtonElement | null>(null);

	$effect(() => {
		if (!open) return;
		const timeout = window.setTimeout(() => confirmButton?.focus(), 0);
		return () => window.clearTimeout(timeout);
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			oncancel();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			onconfirm();
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			oncancel();
		}
	}
</script>

{#if open}
	<div
		class="confirm-backdrop"
		role="presentation"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div
			class="confirm-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-dialog-title"
		>
			<h2 id="confirm-dialog-title" class="confirm-title">{title}</h2>
			<p class="confirm-message">{message}</p>
			<div class="confirm-actions">
				<button type="button" class="btn-sm ghost" onclick={oncancel}>{cancelLabel}</button>
				<button
					bind:this={confirmButton}
					type="button"
					class="btn-sm"
					class:danger={variant === 'danger'}
					onclick={onconfirm}
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.confirm-backdrop {
		align-items: center;
		background: rgba(15, 23, 42, 0.35);
		display: flex;
		inset: 0;
		justify-content: center;
		padding: 1rem;
		position: fixed;
		z-index: 60;
	}

	.confirm-dialog {
		background: var(--bg-raised, #fff);
		border: 1px solid var(--line, #d0d7de);
		border-radius: var(--radius, 6px);
		box-shadow: 0 20px 45px rgba(15, 23, 42, 0.2);
		display: grid;
		gap: 0.75rem;
		padding: 1.25rem;
		width: min(420px, calc(100vw - 2rem));
	}

	.confirm-title {
		color: var(--ink, #0f172a);
		font-family: var(--font-display, inherit);
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.confirm-message {
		color: var(--ink-soft, #334155);
		line-height: 1.45;
		margin: 0;
	}

	.confirm-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}
</style>
