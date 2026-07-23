<script lang="ts">
	import WordProofreadToggle from '../../src/lib/components/WordProofreadToggle.svelte';

	let {
		wordId = 'word-1',
		proofread = false,
		canEdit = false
	}: { wordId?: string; proofread?: boolean; canEdit?: boolean } = $props();
</script>

<WordProofreadToggle {wordId} {proofread} {canEdit} />
