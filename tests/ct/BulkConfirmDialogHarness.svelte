<script lang="ts">
	import BulkConfirmDialog from '../../src/lib/components/BulkConfirmDialog.svelte';

	let { open = true }: { open?: boolean } = $props();
	let closes = $state(0);
</script>

<BulkConfirmDialog {open} labelledby="t" onclose={() => (closes += 1)}>
	<h3 id="t">Title here</h3>
	<p>Body text</p>
	<button type="button" data-testid="inside">Inside</button>
</BulkConfirmDialog>
<div data-testid="closes">{closes}</div>
