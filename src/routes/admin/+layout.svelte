<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import AdminTabs from '$lib/components/AdminTabs.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// Managers open their own activity page from the user menu; it stands on
	// its own for them, without the surrounding tabs.
	const showTabs = $derived(
		data.user?.role === 'ADMIN' || !page.url.pathname.startsWith('/admin/activity')
	);
</script>

{#if showTabs}
	<AdminTabs
		showUsers={data.user?.role === 'ADMIN'}
		counts={{ '/admin/suggestions': data.pendingSuggestionCount }}
	/>
{/if}

{@render children()}
