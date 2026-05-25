<script lang="ts">
	import { page } from '$app/state';
	import { ADMIN_TABS } from '$lib/admin-tabs';

	let {
		showUsers = false,
		counts = {}
	}: { showUsers?: boolean; counts?: Record<string, number> } = $props();

	const visibleTabs = $derived(ADMIN_TABS.filter((tab) => !tab.adminOnly || showUsers));

	function isActive(href: string): boolean {
		return page.url.pathname === href;
	}

</script>

<nav class="admin-tabs" aria-label="Admin tools">
	{#each visibleTabs as tab (tab.href)}
		{@const count = counts[tab.href]}
		<a
			href={tab.href}
			class:active={isActive(tab.href)}
			aria-current={isActive(tab.href) ? 'page' : undefined}
		>
			{tab.label}{#if count && count > 0}<span class="tab-count" aria-label={`${count} pending`}>({count})</span>{/if}
		</a>
	{/each}
</nav>

<style>
	.admin-tabs {
		display: flex;
		flex-wrap: nowrap;
		gap: 0;
		margin: 8px 0 1.75rem;
		overflow-x: auto;
		border-bottom: 1px solid var(--line);
		scrollbar-width: thin;
	}

	.admin-tabs a {
		flex: 0 0 auto;
		margin: 0 0 -1px;
		padding: 0.8rem 0.9rem 0.72rem;
		border: 1px solid var(--line);
		border-bottom-color: var(--line);
		border-radius: 7px 7px 0 0;
		background: color-mix(in oklch, var(--surface) 70%, transparent);
		color: var(--ink-soft);
		font-weight: 650;
		font-size: 0.92rem;
		text-decoration: none;
		white-space: nowrap;
	}

	.admin-tabs a:first-child {
		margin-left: 0;
	}

	.admin-tabs a + a {
		border-left: 0;
	}

	.admin-tabs a:hover {
		background: var(--bg-raised);
		border-color: var(--line);
		border-bottom-color: var(--line);
		color: var(--ink);
		text-decoration: none;
	}

	.admin-tabs a:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px color-mix(in oklch, var(--accent) 38%, transparent);
		position: relative;
		z-index: 1;
	}

	.admin-tabs a.active {
		background: var(--bg);
		border-color: var(--line);
		border-bottom-color: var(--bg);
		color: var(--ink);
	}

	.tab-count {
		margin-left: 4px;
		font-weight: 500;
		color: var(--ink-mute);
	}

	.admin-tabs a.active .tab-count {
		color: var(--accent);
	}

	@media (max-width: 720px) {
		.admin-tabs {
			margin-top: 6px;
			margin-bottom: 1.25rem;
		}

		.admin-tabs a {
			padding: 0.72rem 0.75rem 0.65rem;
			font-size: 0.86rem;
		}
	}
</style>
