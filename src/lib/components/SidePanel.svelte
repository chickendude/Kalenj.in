<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		extraClass = '',
		children
	}: {
		title: string;
		extraClass?: string;
		children: Snippet;
	} = $props();
</script>

<div class={extraClass ? `side-card ${extraClass}` : 'side-card'}>
	<h3>{title}</h3>
	{@render children()}
</div>
