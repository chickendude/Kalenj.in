<script lang="ts">
	import SidePanel from '../../src/lib/components/SidePanel.svelte';

	let {
		title = 'Pronunciation',
		extraClass = ''
	}: {
		title?: string;
		extraClass?: string;
	} = $props();
</script>

<SidePanel {title} {extraClass}>
	<p data-testid="slot-content">Slot body</p>
</SidePanel>
