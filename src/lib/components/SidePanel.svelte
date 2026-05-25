<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		extraClass = '',
		actions,
		children
	}: {
		title: string;
		extraClass?: string;
		actions?: Snippet;
		children: Snippet;
	} = $props();
</script>

<div class={extraClass ? `side-card ${extraClass}` : 'side-card'}>
	<div class="side-card-head">
		<h3>{title}</h3>
		{#if actions}
			<div class="side-card-actions">
				{@render actions()}
			</div>
		{/if}
	</div>
	{@render children()}
</div>

<style>
	.side-card-head {
		align-items: center;
		display: flex;
		gap: 12px;
		justify-content: space-between;
		margin: 0 0 14px;
	}

	.side-card-head :global(h3) {
		margin: 0;
	}

	.side-card-actions {
		align-items: center;
		display: inline-flex;
		flex: 0 0 auto;
	}
</style>
