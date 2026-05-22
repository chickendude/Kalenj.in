<script lang="ts">
	let { error }: { error?: string | null | undefined } = $props();
</script>

{#if error}
	<div class="form-feedback error">{error}</div>
{/if}
