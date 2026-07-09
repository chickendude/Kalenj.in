<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';
	import type { ReportTargetType } from '@prisma/client';

	let {
		open,
		targetType,
		targetId,
		lessonId = null,
		signedOut = false,
		onclose
	}: {
		open: boolean;
		targetType: ReportTargetType;
		targetId: string;
		lessonId?: string | null;
		/** Signed out: questions need an account, so show a sign-in prompt instead. */
		signedOut?: boolean;
		onclose: () => void;
	} = $props();

	let question = $state('');
	let submitting = $state(false);
	let errorMessage = $state<string | null>(null);
	let firstField = $state<HTMLTextAreaElement | null>(null);

	$effect(() => {
		if (!open) return;
		question = '';
		errorMessage = null;
		firstField?.focus();
	});

	$effect(() => {
		if (!open) return;
		function handleKeydown(event: KeyboardEvent) {
			if (event.key === 'Escape' && !submitting) {
				event.preventDefault();
				onclose();
			}
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	function handleBackdropClick(event: MouseEvent) {
		if (submitting) return;
		if (event.target === event.currentTarget) onclose();
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (submitting) return;
		submitting = true;
		errorMessage = null;
		try {
			const res = await fetch('/api/learn/clarifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					targetType,
					targetId,
					lessonId,
					question: question.trim()
				})
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				errorMessage = body?.message ?? 'Could not send your question.';
				return;
			}
			toast.success("Sent — you'll find the answer under Your questions.", 2600);
			onclose();
		} catch {
			errorMessage = 'Could not send your question. Check your connection.';
		} finally {
			submitting = false;
		}
	}
</script>

{#if open}
	<div class="clarify-backdrop" role="presentation" onclick={handleBackdropClick}>
		<div
			class="clarify-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="clarify-dialog-title"
		>
			<h2 id="clarify-dialog-title" class="clarify-title">Ask a question</h2>
			{#if signedOut}
				<p class="signed-out-note">
					Questions need an account, so the editors' answers can find their way back to you.
				</p>
				<div class="clarify-actions">
					<button type="button" class="btn-sm ghost" onclick={onclose}>Not now</button>
					<a class="btn-sm auth-link" href="/login">Sign in</a>
					<a class="btn-sm auth-link" href="/signup">Create an account</a>
				</div>
			{:else}
			<form onsubmit={submit}>
				<div class="clarify-field">
					<label for="clarify-question">What don't you understand?</label>
					<textarea
						id="clarify-question"
						class="input clarify-textarea"
						rows="4"
						maxlength="2000"
						placeholder="e.g. Why does this word change form here?"
						bind:value={question}
						bind:this={firstField}
						disabled={submitting}
						required
					></textarea>
				</div>
				{#if errorMessage}
					<div class="form-feedback error">{errorMessage}</div>
				{/if}
				<div class="clarify-actions">
					<button type="button" class="btn-sm ghost" onclick={onclose} disabled={submitting}>
						Cancel
					</button>
					<button type="submit" class="btn-sm" disabled={submitting || !question.trim()}>
						{submitting ? 'Sending…' : 'Send question'}
					</button>
				</div>
			</form>
			{/if}
		</div>
	</div>
{/if}

<style>
	.clarify-backdrop {
		align-items: center;
		background: rgba(15, 23, 42, 0.35);
		display: flex;
		inset: 0;
		justify-content: center;
		padding: 1rem;
		position: fixed;
		z-index: 60;
	}

	.clarify-dialog {
		background: var(--bg-raised, #fff);
		border: 1px solid var(--line, #d0d7de);
		border-radius: var(--radius, 6px);
		box-shadow: 0 20px 45px rgba(15, 23, 42, 0.2);
		display: grid;
		gap: 0.75rem;
		padding: 1.25rem;
		width: min(440px, calc(100vw - 2rem));
	}

	.clarify-title {
		color: var(--ink, #0f172a);
		font-family: var(--font-display, inherit);
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.signed-out-note {
		color: var(--ink-soft, #334155);
		font-size: 14px;
		margin: 0;
	}

	.auth-link {
		text-decoration: none;
	}

	.clarify-field {
		display: grid;
		gap: 4px;
		margin-top: 0.5rem;
	}

	.clarify-field label {
		color: var(--ink-soft, #334155);
		font-size: 13px;
		font-weight: 500;
	}

	.clarify-textarea {
		font-family: inherit;
		resize: vertical;
	}

	.clarify-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}
</style>
