<script lang="ts">
	export type FilterChipItem = {
		href: string;
		label: string;
		active: boolean;
		count?: number;
	};

	let { items, label }: { items: FilterChipItem[]; label: string } = $props();
</script>

<nav class="filter-row" aria-label={label} data-sveltekit-noscroll data-sveltekit-replacestate>
	{#each items as item (item.href)}
		<a
			class="filter-chip"
			class:active={item.active}
			aria-current={item.active ? 'page' : undefined}
			href={item.href}
		>
			{item.label}
			{#if item.count !== undefined}
				<span class="filter-count">{item.count.toLocaleString()}</span>
			{/if}
		</a>
	{/each}
</nav>

<style>
	.filter-row {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
		margin: 8px 0 16px;
	}

	.filter-chip {
		align-items: center;
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-soft);
		display: inline-flex;
		font-size: 13px;
		gap: 8px;
		padding: 4px 12px;
		text-decoration: none;
	}

	.filter-chip:hover {
		background: color-mix(in oklch, var(--brand) 8%, transparent);
		text-decoration: none;
	}

	.filter-chip.active,
	.filter-chip.active:hover {
		background: var(--brand);
		border-color: var(--brand);
		color: var(--brand-ink, #fff);
	}

	.filter-count {
		font-size: 11.5px;
		opacity: 0.75;
	}
</style>
