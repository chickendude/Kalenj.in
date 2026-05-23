<script lang="ts">
	import NavSearch from '../../src/lib/components/NavSearch.svelte';
</script>

<header class="topbar">
	<div class="topbar-inner">
		<span class="brand">
			<span class="brand-text">
				<span class="brand-name">alenj.in</span>
			</span>
		</span>
		<NavSearch />
		<div class="side-menu">
			<button type="button" class="side-menu-toggle" aria-label="Open menu">≡</button>
		</div>
	</div>
</header>
