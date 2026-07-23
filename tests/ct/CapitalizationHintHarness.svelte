<script lang="ts">
	import CapitalizationHint from '../../src/lib/components/CapitalizationHint.svelte';

	let {
		initialValue = '',
		suppress = false,
		auto = false
	}: { initialValue?: string; suppress?: boolean; auto?: boolean } = $props();

	// svelte-ignore state_referenced_locally -- the harness intentionally seeds once
	let value = $state(initialValue);
</script>

<input aria-label="Word" bind:value />
<CapitalizationHint bind:value {suppress} {auto} />
