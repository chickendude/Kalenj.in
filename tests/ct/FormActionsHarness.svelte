<script lang="ts">
	import FormActions from '../../src/lib/components/FormActions.svelte';

	let {
		submitLabel = 'Save',
		submitDisabled = false,
		cancelLabel = 'Cancel',
		withCancel = false
	}: {
		submitLabel?: string;
		submitDisabled?: boolean;
		cancelLabel?: string;
		withCancel?: boolean;
	} = $props();

	let cancelCount = $state(0);
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		const target = e.target as HTMLFormElement;
		target.dataset.submitted = String((Number(target.dataset.submitted) || 0) + 1);
	}}
>
	<FormActions
		{submitLabel}
		{submitDisabled}
		{cancelLabel}
		onCancel={withCancel ? () => (cancelCount += 1) : undefined}
	/>
</form>
<div data-testid="cancel-count">{cancelCount}</div>
