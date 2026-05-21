<script lang="ts">
	let {
		submitLabel,
		submitDisabled = false,
		cancelLabel = 'Cancel',
		onCancel
	}: {
		submitLabel: string;
		submitDisabled?: boolean;
		cancelLabel?: string;
		onCancel?: () => void;
	} = $props();
</script>

<div class="form-actions">
	<button type="submit" class="btn" disabled={submitDisabled}>{submitLabel}</button>
	{#if onCancel}
		<button type="button" class="btn ghost" onclick={onCancel}>{cancelLabel}</button>
	{/if}
</div>
