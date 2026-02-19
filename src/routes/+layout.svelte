<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header>
	<nav>
		<a href="/">Home</a>
		<a href="/dictionary">Dictionary</a>
	</nav>
</header>

<main>
	{@render children()}
</main>

<style>
	header {
		border-bottom: 1px solid #ddd;
		padding: 0.75rem 1rem;
	}

	nav {
		display: flex;
		gap: 1rem;
		font-size: 0.95rem;
	}

	main {
		margin: 0 auto;
		max-width: 960px;
		padding: 1.5rem 1rem;
	}
</style>
