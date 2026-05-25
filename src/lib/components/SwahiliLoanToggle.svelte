<script lang="ts">
	import WordPill from '$lib/components/WordPill.svelte';

	let {
		name = 'isSwahiliLoan',
		form,
		checked = $bindable(false)
	}: {
		name?: string;
		form?: string;
		checked?: boolean;
	} = $props();

	const tooltip = 'Mark this word as borrowed from Swahili.';
</script>

<WordPill text="sw" {tooltip} {name} {form} bind:checked toggle lowercase />
