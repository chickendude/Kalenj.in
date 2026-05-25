<script lang="ts">
	import Tooltip from '$lib/components/Tooltip.svelte';

	let {
		text,
		tooltip,
		size = 'default',
		tone = 'neutral',
		lowercase = false,
		abbreviation = false,
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
		abbreviation?: boolean;
		toggle?: boolean;
		name?: string;
		form?: string;
		checked?: boolean;
	} = $props();

	const label = $derived(tooltip);
</script>

<Tooltip label={tooltip}>
	{#if toggle}
		<label
			class="word-pill"
			class:tiny={size === 'tiny'}
			class:accent={tone === 'accent'}
			class:lowercase
			class:checked
		>
			<input type="checkbox" {name} {form} bind:checked aria-label={label} />
			<span aria-hidden="true">{text}</span>
		</label>
	{:else if abbreviation}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<abbr
			class="word-pill"
			class:tiny={size === 'tiny'}
			class:accent={tone === 'accent'}
			class:lowercase
			aria-label={label}
			tabindex="0"
		>{text}</abbr>
	{:else}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<span
			class="word-pill"
			class:tiny={size === 'tiny'}
			class:accent={tone === 'accent'}
			class:lowercase
			aria-label={label}
			tabindex="0"
		>{text}</span>
	{/if}
</Tooltip>

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
		font-weight: 600;
		justify-content: center;
		letter-spacing: 0.03em;
		line-height: 1;
		margin: 0;
		padding: 0.2rem 0.46rem;
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
		font-weight: 700;
		padding-inline: 0.36rem;
	}

	label.word-pill:hover,
	label.word-pill:focus-within {
		background: color-mix(in oklch, var(--accent) 8%, var(--bg-raised));
		border-color: color-mix(in oklch, var(--accent) 35%, var(--line));
		color: var(--accent);
	}

	.word-pill:focus-visible,
	label.word-pill:has(input:focus-visible) {
		outline: 2px solid var(--brand);
		outline-offset: 2px;
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
	}

	.word-pill input {
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		height: 1px;
		margin: -1px;
		opacity: 0;
		overflow: hidden;
		position: absolute;
		white-space: nowrap;
		width: 1px;
	}
</style>
