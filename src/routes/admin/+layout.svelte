<script lang="ts">
	import type { Snippet } from 'svelte';
	import AdminTabs from '$lib/components/AdminTabs.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<AdminTabs showUsers={data.user?.role === 'ADMIN'} />

{@render children()}
