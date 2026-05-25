<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ExampleSentenceStatus } from '@prisma/client';

	type Props = {
		status: ExampleSentenceStatus;
		canEdit?: boolean;
	};

	let { status, canEdit = false }: Props = $props();

	const CYCLE: ExampleSentenceStatus[] = ['NEEDS_PROOFREAD', 'IN_CORPUS', 'STORY_ONLY'];

	const LABELS: Record<ExampleSentenceStatus, string> = {
		NEEDS_PROOFREAD: 'Needs proofread',
		IN_CORPUS: 'In corpus',
		STORY_ONLY: 'Story only'
	};

	const nextStatus = $derived(CYCLE[(CYCLE.indexOf(status) + 1) % CYCLE.length]);
	let pending = $state(false);

	function handleSubmit() {
		pending = true;
		return async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			pending = false;
		};
	}
</script>

{#snippet icon(s: ExampleSentenceStatus)}
	{#if s === 'NEEDS_PROOFREAD'}
		<span aria-hidden="true" class="glyph">!</span>
	{:else if s === 'IN_CORPUS'}
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M3.5 8.5l3 3 6-7"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	{:else}
		<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M3 2.5h6.5c1 0 1.8.8 1.8 1.8v9.4c-.8-.6-1.7-.9-2.7-.9H3V2.5Z"
				stroke="currentColor"
				stroke-width="1.3"
				stroke-linejoin="round"
			/>
			<path
				d="M5 5.5h4M5 7.5h4M5 9.5h2.5"
				stroke="currentColor"
				stroke-width="1.3"
				stroke-linecap="round"
			/>
		</svg>
	{/if}
{/snippet}

{#if canEdit}
	<form
		method="POST"
		action="?/setSentenceStatus"
		class="status-form"
		use:enhance={handleSubmit}
	>
		<button
			type="submit"
			name="status"
			value={nextStatus}
			class="sentence-status sentence-status--{status.toLowerCase()}"
			aria-label="Status: {LABELS[status]}. Click to change."
			disabled={pending}
		>
			{@render icon(status)}
			<span class="sentence-status-tooltip" role="tooltip">{LABELS[status]}</span>
		</button>
	</form>
{:else}
	<span
		class="sentence-status sentence-status--{status.toLowerCase()} sentence-status--static"
		aria-label="Status: {LABELS[status]}"
	>
		{@render icon(status)}
		<span class="sentence-status-tooltip" role="tooltip">{LABELS[status]}</span>
	</span>
{/if}

<style>
	.status-form {
		display: inline-flex;
	}

	.sentence-status {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-soft);
		cursor: pointer;
		display: inline-flex;
		flex: 0 0 auto;
		font-size: 12px;
		font-weight: 800;
		height: 1.5rem;
		justify-content: center;
		line-height: 1;
		padding: 0;
		position: relative;
		text-decoration: none;
		vertical-align: middle;
		width: 1.5rem;
	}

	.sentence-status--static {
		cursor: help;
	}

	.sentence-status:disabled {
		cursor: progress;
		opacity: 0.7;
	}

	.sentence-status--needs_proofread {
		background: var(--danger-soft);
		border-color: var(--danger);
		color: var(--danger);
	}

	.sentence-status--in_corpus {
		background: color-mix(in oklab, var(--success, #2e7d32) 12%, transparent);
		border-color: color-mix(in oklab, var(--success, #2e7d32) 50%, transparent);
		color: var(--success, #2e7d32);
	}

	.sentence-status--story_only {
		background: color-mix(in oklab, var(--brand) 10%, transparent);
		border-color: color-mix(in oklab, var(--brand) 30%, transparent);
		color: var(--brand);
	}

	.sentence-status:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}

	.glyph {
		display: inline-flex;
	}

	.sentence-status-tooltip {
		background: var(--tooltip-bg);
		border-radius: 6px;
		bottom: calc(100% + 0.35rem);
		color: var(--tooltip-ink);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 500;
		left: 50%;
		line-height: 1.35;
		max-width: 14rem;
		opacity: 0;
		padding: 0.4rem 0.55rem;
		pointer-events: none;
		position: absolute;
		text-align: left;
		text-transform: none;
		transform: translateX(-50%);
		transition: opacity 0s linear;
		white-space: nowrap;
		width: max-content;
		z-index: 20;
	}

	.sentence-status:hover .sentence-status-tooltip,
	.sentence-status:focus-visible .sentence-status-tooltip {
		opacity: 1;
	}
</style>
