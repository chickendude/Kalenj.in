<script lang="ts">
	import { enhance } from '$app/forms';

	type Props = {
		wordId: string;
		proofread: boolean;
		canEdit?: boolean;
	};

	let { wordId, proofread, canEdit = false }: Props = $props();

	const label = $derived(proofread ? 'Proofread' : 'Not proofread');
	let pending = $state(false);

	function handleSubmit() {
		pending = true;
		return async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			pending = false;
		};
	}
</script>

{#snippet icon()}
	{#if proofread}
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
		<span aria-hidden="true" class="glyph">!</span>
	{/if}
{/snippet}

{#if canEdit}
	<form method="POST" action="?/setWordProofread" class="proofread-form" use:enhance={handleSubmit}>
		<input type="hidden" name="wordId" value={wordId} />
		<button
			type="submit"
			name="proofread"
			value={proofread ? '0' : '1'}
			class="word-proofread"
			class:word-proofread--done={proofread}
			aria-label="Status: {label}. Click to change."
			disabled={pending}
		>
			{@render icon()}
			<span class="word-proofread-tooltip" role="tooltip">{label}</span>
		</button>
	</form>
{:else}
	<span
		class="word-proofread word-proofread--static"
		class:word-proofread--done={proofread}
		aria-label="Status: {label}"
	>
		{@render icon()}
		<span class="word-proofread-tooltip" role="tooltip">{label}</span>
	</span>
{/if}

<style>
	.proofread-form {
		display: inline-flex;
	}

	.word-proofread {
		align-items: center;
		background: var(--danger-soft);
		border: 1px solid var(--danger);
		border-radius: 999px;
		color: var(--danger);
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

	.word-proofread--done {
		background: color-mix(in oklab, var(--success, #2e7d32) 12%, transparent);
		border-color: color-mix(in oklab, var(--success, #2e7d32) 50%, transparent);
		color: var(--success, #2e7d32);
	}

	.word-proofread--static {
		cursor: help;
	}

	.word-proofread:disabled {
		cursor: progress;
		opacity: 0.7;
	}

	.word-proofread:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}

	.glyph {
		display: inline-flex;
	}

	.word-proofread-tooltip {
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

	.word-proofread:hover .word-proofread-tooltip,
	.word-proofread:focus-visible .word-proofread-tooltip {
		opacity: 1;
	}
</style>
