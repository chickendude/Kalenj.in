<script lang="ts">
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();

	const navItems = [
		{ href: '/', label: 'Home' },
		{ href: '/dictionary', label: 'Dictionary' },
		{ href: '/corpus', label: 'Corpus' },
		{ href: '/cefr', label: 'CEFR' },
		{ href: '/lessons', label: 'Lessons' }
	];

	function isActive(href: string): boolean {
		if (href === '/') {
			return page.url.pathname === '/';
		}

		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="topbar">
	<div class="topbar-inner">
		<a href="/" class="brand">
			<span class="brand-dot"></span>
			<span>Kalenj<span style="color: var(--accent)">.</span>in</span>
			<span class="brand-sub">Dictionary, Corpus &amp; Course</span>
		</a>
		<nav class="topbar-nav" aria-label="Primary navigation">
			{#each navItems as item}
				<a
					href={item.href}
					class:active={isActive(item.href)}
					aria-current={isActive(item.href) ? 'page' : undefined}
				>
					{item.label}
				</a>
			{/each}
		</nav>
	</div>
</header>

<main class="shell">
	{@render children()}
</main>
