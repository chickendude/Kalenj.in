<script lang="ts">
	import ActivityEntriesView from '$lib/components/ActivityEntriesView.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<ActivityEntriesView {data} form={form ?? null} />
