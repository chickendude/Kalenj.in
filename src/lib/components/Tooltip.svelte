<script lang="ts">
	import type { Snippet } from 'svelte';

	type Placement = 'top' | 'bottom' | 'left' | 'right';

	let {
		label,
		placement = 'top',
		children
	}: {
		label: string;
		placement?: Placement;
		children: Snippet;
	} = $props();
</script>

<!--
  Use this instead of the native HTML `title` attribute. Wrap the trigger
  element (button, icon, etc) so the tooltip is positioned relative to it.

  Project rule: never use HTML `title=` attributes for tooltips — use this
  component so styling, focus behavior, and dark/light themes stay consistent.
-->
<span class="tooltip-host" data-placement={placement}>
	{@render children()}
	<span class="tooltip-bubble" role="tooltip">{label}</span>
</span>

<style>
	.tooltip-host {
		display: inline-flex;
		position: relative;
	}

	.tooltip-bubble {
		background: var(--tooltip-bg);
		border-radius: 0.45rem;
		color: var(--tooltip-ink);
		font-family: var(--font-body, inherit);
		font-size: 0.78rem;
		font-weight: 500;
		line-height: 1.4;
		max-width: 18rem;
		opacity: 0;
		padding: 0.35rem 0.55rem;
		pointer-events: none;
		position: absolute;
		text-align: center;
		transition: opacity 0.12s ease-out;
		white-space: nowrap;
		width: max-content;
		z-index: 50;
	}

	.tooltip-host[data-placement='top'] > .tooltip-bubble {
		bottom: calc(100% + 0.4rem);
		left: 50%;
		transform: translateX(-50%);
	}
	.tooltip-host[data-placement='bottom'] > .tooltip-bubble {
		top: calc(100% + 0.4rem);
		left: 50%;
		transform: translateX(-50%);
	}
	.tooltip-host[data-placement='left'] > .tooltip-bubble {
		right: calc(100% + 0.4rem);
		top: 50%;
		transform: translateY(-50%);
	}
	.tooltip-host[data-placement='right'] > .tooltip-bubble {
		left: calc(100% + 0.4rem);
		top: 50%;
		transform: translateY(-50%);
	}

	.tooltip-host:hover > .tooltip-bubble,
	.tooltip-host:focus-within > .tooltip-bubble {
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.tooltip-bubble {
			transition: none;
		}
	}
</style>
