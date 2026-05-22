<script lang="ts">
	import FormErrorFeedback from '../../src/lib/components/FormErrorFeedback.svelte';

	let { error }: { error?: string | null | undefined } = $props();
</script>

<FormErrorFeedback {error} />
