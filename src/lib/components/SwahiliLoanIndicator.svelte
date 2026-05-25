<script lang="ts">
	import WordPill from '$lib/components/WordPill.svelte';

	let { compact = false }: { compact?: boolean } = $props();

	const tooltip = 'Borrowed from Swahili.';
</script>

<WordPill text="sw" {tooltip} size={compact ? 'tiny' : 'default'} tone="accent" lowercase />
