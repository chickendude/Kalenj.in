<script lang="ts">
	import { REPORT_ISSUE_LABELS, REPORT_ISSUE_TYPES } from '$lib/report-issue-types';
	import { toast } from '$lib/stores/toast.svelte';
	import type { ReportIssueType, ReportTargetType } from '@prisma/client';

	let {
		open,
		targetType,
		targetId,
		targetLabel,
		onclose
	}: {
		open: boolean;
		targetType: ReportTargetType;
		targetId: string;
		targetLabel: string;
		onclose: () => void;
	} = $props();

	let issueType = $state<ReportIssueType>('WRONG_TRANSLATION');
	let suggestedFix = $state('');
	let submitting = $state(false);
	let errorMessage = $state<string | null>(null);
	let firstField = $state<HTMLSelectElement | null>(null);

	$effect(() => {
		if (!open) return;
		issueType = 'WRONG_TRANSLATION';
		suggestedFix = '';
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
			const res = await fetch('/api/reports', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					targetType,
					targetId,
					issueType,
					suggestedFix: suggestedFix.trim() || null
				})
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				errorMessage = body?.message ?? 'Could not submit report.';
				return;
			}
			toast.success('Thanks — report submitted.');
			onclose();
		} catch {
			errorMessage = 'Could not submit report. Check your connection.';
		} finally {
			submitting = false;
		}
	}
</script>

{#if open}
	<div class="report-backdrop" role="presentation" onclick={handleBackdropClick}>
		<div
			class="report-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="report-dialog-title"
		>
			<h2 id="report-dialog-title" class="report-title">Report an issue</h2>
			<p class="report-target">{targetLabel}</p>
			<form onsubmit={submit}>
				<div class="report-field">
					<label for="report-issue-type">What's the issue?</label>
					<select
						id="report-issue-type"
						class="select"
						bind:value={issueType}
						bind:this={firstField}
						disabled={submitting}
					>
						{#each REPORT_ISSUE_TYPES as type}
							<option value={type}>{REPORT_ISSUE_LABELS[type]}</option>
						{/each}
					</select>
				</div>
				<div class="report-field">
					<label for="report-suggested-fix">Suggested fix <span class="muted">(optional)</span></label>
					<textarea
						id="report-suggested-fix"
						class="input report-textarea"
						rows="3"
						maxlength="2000"
						placeholder="What should it say instead?"
						bind:value={suggestedFix}
						disabled={submitting}
					></textarea>
				</div>
				{#if errorMessage}
					<div class="form-feedback error">{errorMessage}</div>
				{/if}
				<div class="report-actions">
					<button
						type="button"
						class="btn-sm ghost"
						onclick={onclose}
						disabled={submitting}
					>
						Cancel
					</button>
					<button type="submit" class="btn-sm" disabled={submitting}>
						{submitting ? 'Submitting…' : 'Submit report'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.report-backdrop {
		align-items: center;
		background: rgba(15, 23, 42, 0.35);
		display: flex;
		inset: 0;
		justify-content: center;
		padding: 1rem;
		position: fixed;
		z-index: 60;
	}

	.report-dialog {
		background: var(--bg-raised, #fff);
		border: 1px solid var(--line, #d0d7de);
		border-radius: var(--radius, 6px);
		box-shadow: 0 20px 45px rgba(15, 23, 42, 0.2);
		display: grid;
		gap: 0.75rem;
		padding: 1.25rem;
		width: min(440px, calc(100vw - 2rem));
	}

	.report-title {
		color: var(--ink, #0f172a);
		font-family: var(--font-display, inherit);
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.report-target {
		color: var(--ink-soft, #334155);
		font-size: 14px;
		line-height: 1.4;
		margin: 0;
	}

	.report-field {
		display: grid;
		gap: 4px;
		margin-top: 0.5rem;
	}

	.report-field label {
		color: var(--ink-soft, #334155);
		font-size: 13px;
		font-weight: 500;
	}

	.report-field .muted {
		color: var(--ink-mute, #64748b);
		font-weight: 400;
	}

	.report-textarea {
		font-family: inherit;
		resize: vertical;
	}

	.report-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}
</style>
