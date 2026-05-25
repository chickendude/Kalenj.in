<script lang="ts">
	let {
		text,
		tooltip,
		size = 'default',
		tone = 'neutral',
		lowercase = false,
		toggle = false,
		name,
		form,
		checked = $bindable(false)
	}: {
		text: string;
		tooltip: string;
		size?: 'default' | 'tiny';
		tone?: 'neutral' | 'accent';
		lowercase?: boolean;
		toggle?: boolean;
		name?: string;
		form?: string;
		checked?: boolean;
	} = $props();
</script>

{#snippet content()}
	<span aria-hidden="true">{text}</span>
	<span class="word-pill-tooltip" role="tooltip">{tooltip}</span>
{/snippet}

{#if toggle}
	<label
		class="word-pill"
		class:tiny={size === 'tiny'}
		class:accent={tone === 'accent'}
		class:lowercase
		class:checked
		aria-label={tooltip}
		title={tooltip}
	>
		<input type="checkbox" {name} {form} bind:checked />
		{@render content()}
	</label>
{:else}
	<span
		class="word-pill"
		class:tiny={size === 'tiny'}
		class:accent={tone === 'accent'}
		class:lowercase
		aria-label={tooltip}
		title={tooltip}
	>
		{@render content()}
	</span>
{/if}

<style>
	.word-pill {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-soft);
		cursor: help;
		display: inline-flex;
		flex: 0 0 auto;
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-style: normal;
		font-weight: 700;
		justify-content: center;
		letter-spacing: 0.03em;
		line-height: 1;
		margin: 0;
		min-height: 1.5rem;
		min-width: 1.5rem;
		padding: 0.22rem 0.42rem;
		position: relative;
		text-decoration: none;
		text-transform: uppercase;
		vertical-align: baseline;
	}

	label.word-pill {
		cursor: pointer;
		transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
	}

	.word-pill.accent {
		background: color-mix(in oklch, var(--accent) 12%, transparent);
		border-color: color-mix(in oklch, var(--accent) 30%, var(--line));
		color: var(--accent);
	}

	label.word-pill:hover,
	label.word-pill:focus-within {
		background: color-mix(in oklch, var(--accent) 8%, var(--bg-raised));
		border-color: color-mix(in oklch, var(--accent) 35%, var(--line));
		color: var(--accent);
	}

	label.word-pill.checked {
		background: color-mix(in oklch, var(--accent) 16%, var(--bg-raised));
		border-color: color-mix(in oklch, var(--accent) 55%, var(--line));
		color: var(--accent);
	}

	.word-pill.lowercase {
		text-transform: lowercase;
	}

	.word-pill.tiny {
		font-size: 0.72rem;
		min-height: 1.35rem;
		min-width: 1.35rem;
		padding: 0.18rem 0.38rem;
	}

	.word-pill input {
		height: 1px;
		opacity: 0;
		position: absolute;
		width: 1px;
	}

	.word-pill-tooltip {
		background: var(--tooltip-bg);
		border-radius: 4px;
		bottom: calc(100% + 0.35rem);
		color: var(--tooltip-ink);
		font-family: var(--font-body);
		font-size: 0.74rem;
		font-weight: 500;
		left: 50%;
		letter-spacing: 0;
		line-height: 1.25;
		max-width: 14rem;
		opacity: 0;
		padding: 0.32rem 0.45rem;
		pointer-events: none;
		position: absolute;
		text-align: left;
		text-transform: none;
		transform: translateX(-50%);
		white-space: normal;
		width: max-content;
		z-index: 20;
	}

	.word-pill:hover .word-pill-tooltip,
	.word-pill:focus-visible .word-pill-tooltip,
	.word-pill:focus-within .word-pill-tooltip {
		opacity: 1;
	}
</style>
