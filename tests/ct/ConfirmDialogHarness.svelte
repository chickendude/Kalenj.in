<script lang="ts">
	import ConfirmDialog from '../../src/lib/components/ConfirmDialog.svelte';

	let {
		open = true,
		title = 'Combine words?',
		message = 'Combine these two words into one?',
		confirmLabel = 'Combine words',
		cancelLabel = 'Cancel'
	}: {
		open?: boolean;
		title?: string;
		message?: string;
		confirmLabel?: string;
		cancelLabel?: string;
	} = $props();

	let log = $state<string[]>([]);
	const rec = (a: string) => (log = [...log, a]);
</script>

<ConfirmDialog
	{open}
	{title}
	{message}
	{confirmLabel}
	{cancelLabel}
	onconfirm={() => rec('confirm')}
	oncancel={() => rec('cancel')}
/>
<div data-testid="log">{log.join(',')}</div>
