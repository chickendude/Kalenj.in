<script lang="ts">
	import { page } from '$app/stores';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	const section = $derived(
		$page.url.pathname === '/'
			? 'home'
			: $page.url.pathname.startsWith('/dictionary')
				? 'dictionary'
				: $page.url.pathname.startsWith('/corpus')
					? 'corpus'
					: ''
	);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="topbar">
	<div class="topbar-inner">
		<a href="/" class="brand">
			<span class="brand-dot"></span>
			<span>Kalenj<span style="color: var(--accent)">.</span>in</span>
			<span class="brand-sub">Dictionary &amp; Corpus</span>
		</a>
		<nav class="topbar-nav">
			<a href="/" class:active={section === 'home'}>Home</a>
			<a href="/dictionary" class:active={section === 'dictionary'}>Dictionary</a>
			<a href="/corpus" class:active={section === 'corpus'}>Corpus</a>
		</nav>
	</div>
</header>

{@render children()}
