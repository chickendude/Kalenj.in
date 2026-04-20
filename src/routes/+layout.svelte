<script lang="ts">
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import { theme, toggleTheme } from '$lib/stores/theme';
	import '../app.css';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const navItems = $derived.by(() => {
		const items = [
			{ href: '/', label: 'Home' },
			{ href: '/dictionary', label: 'Dictionary' },
			{ href: '/corpus', label: 'Corpus' }
		];
		if (data.user) {
			items.push({ href: '/cefr', label: 'CEFR' });
			items.push({ href: '/lessons', label: 'Lessons' });
		}
		return items;
	});

	function isActive(href: string): boolean {
		if (href === '/') {
			return page.url.pathname === '/';
		}

		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	let menuOpen = $state(false);
	let menuRoot: HTMLDivElement | undefined = $state();

	function toggleMenu() {
		menuOpen = !menuOpen;
	}

	function closeMenu() {
		menuOpen = false;
	}

	$effect(() => {
		if (!menuOpen) return;

		function onPointerDown(event: PointerEvent) {
			if (menuRoot && !menuRoot.contains(event.target as Node)) {
				menuOpen = false;
			}
		}
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') menuOpen = false;
		}

		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKey);
		};
	});
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
		<div class="topbar-user">
			{#if data.user}
				<div class="user-menu" bind:this={menuRoot}>
					<button
						type="button"
						class="user-menu-trigger"
						aria-haspopup="menu"
						aria-expanded={menuOpen}
						onclick={toggleMenu}
					>
						<span class="who">{data.user.username}</span>
						<span class="caret" aria-hidden="true">▾</span>
					</button>
					{#if menuOpen}
						<div class="user-menu-panel" role="menu">
							<a
								href="/account"
								role="menuitem"
								class:active={isActive('/account')}
								onclick={closeMenu}
							>
								Account
							</a>
							{#if data.user.role === 'ADMIN'}
								<a
									href="/admin/users"
									role="menuitem"
									class:active={isActive('/admin/users')}
									onclick={closeMenu}
								>
									Admin
								</a>
							{/if}
							<form method="POST" action="/logout">
								<button type="submit" role="menuitem" class="user-menu-item">Sign out</button>
							</form>
						</div>
					{/if}
				</div>
			{:else if page.url.pathname !== '/login'}
				<a href="/login">Sign in</a>
			{/if}
		</div>
	</div>
</header>

<main class="shell">
	{@render children()}
</main>
