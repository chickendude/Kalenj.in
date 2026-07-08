<script lang="ts">
	import ReviewSession from '$lib/components/learn/ReviewSession.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Review · Learn</title>
</svelte:head>

<ReviewSession cards={data.cards} />
