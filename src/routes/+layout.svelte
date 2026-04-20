<script lang="ts">
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import { theme, toggleTheme } from '$lib/stores/theme';
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
		<button
			type="button"
			class="theme-toggle"
			onclick={toggleTheme}
			aria-label={$theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
			aria-pressed={$theme === 'dark'}
			title={$theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
		>
			{#if $theme === 'dark'}
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="4" />
					<path d="M12 2v2" />
					<path d="M12 20v2" />
					<path d="m4.93 4.93 1.41 1.41" />
					<path d="m17.66 17.66 1.41 1.41" />
					<path d="M2 12h2" />
					<path d="M20 12h2" />
					<path d="m4.93 19.07 1.41-1.41" />
					<path d="m17.66 6.34 1.41-1.41" />
				</svg>
			{:else}
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
				</svg>
			{/if}
		</button>
	</div>
</header>

<main class="shell">
	{@render children()}
</main>
