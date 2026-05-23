<script lang="ts">
	let { href }: { href?: string } = $props();

	const tooltip = "This sentence hasn't been proofread yet.";
</script>

{#snippet indicatorContent()}
	<span aria-hidden="true">!</span>
	<span class="proofread-tooltip" role="tooltip">{tooltip}</span>
{/snippet}

{#if href}
	<a class="proofread-indicator" {href} aria-label={tooltip}>
		{@render indicatorContent()}
	</a>
{:else}
	<button type="button" class="proofread-indicator" aria-label={tooltip}>
		{@render indicatorContent()}
	</button>
{/if}

<style>
	.proofread-indicator {
		align-items: center;
		background: var(--danger-soft);
		border: 1px solid var(--danger);
		border-radius: 999px;
		color: var(--danger);
		cursor: help;
		display: inline-flex;
		flex: 0 0 auto;
		font-size: 12px;
		font-weight: 800;
		height: 1.25rem;
		justify-content: center;
		line-height: 1;
		padding: 0;
		position: relative;
		text-decoration: none;
		vertical-align: middle;
		width: 1.25rem;
		z-index: 2;
	}

	a.proofread-indicator {
		cursor: pointer;
	}

	.proofread-indicator:focus-visible {
		outline: 2px solid var(--danger);
		outline-offset: 2px;
	}

	.proofread-tooltip {
		background: var(--tooltip-bg);
		border-radius: 6px;
		bottom: calc(100% + 0.35rem);
		color: var(--tooltip-ink);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 500;
		left: 50%;
		line-height: 1.35;
		max-width: 15rem;
		opacity: 0;
		padding: 0.45rem 0.6rem;
		pointer-events: none;
		position: absolute;
		text-align: left;
		text-transform: none;
		transform: translateX(-50%);
		transition: opacity 0s linear;
		white-space: normal;
		width: max-content;
		z-index: 20;
	}

	.proofread-indicator:hover .proofread-tooltip,
	.proofread-indicator:focus-visible .proofread-tooltip {
		opacity: 1;
	}
</style>
