<script lang="ts">
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import { theme, toggleTheme } from '$lib/stores/theme';
	import Toast from '$lib/components/Toast.svelte';
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
	let navOpen = $state(false);
	let navRoot: HTMLDivElement | undefined = $state();

	function toggleMenu() {
		menuOpen = !menuOpen;
	}

	function closeMenu() {
		menuOpen = false;
	}

	function toggleNav() {
		navOpen = !navOpen;
	}

	function closeNav() {
		navOpen = false;
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

	$effect(() => {
		if (!navOpen) return;

		function onPointerDown(event: PointerEvent) {
			if (navRoot && !navRoot.contains(event.target as Node)) {
				navOpen = false;
			}
		}
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') navOpen = false;
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
			<svg
				class="brand-logo"
				width="28"
				height="28"
				viewBox="0 0 64 64"
				xmlns="http://www.w3.org/2000/svg"
				aria-hidden="true"
			>
				<defs>
					<clipPath id="brand-clip"><rect width="64" height="64" rx="10" /></clipPath>
					<linearGradient id="brand-sky" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stop-color="#6b8a7a" />
						<stop offset="1" stop-color="#365e4a" />
					</linearGradient>
				</defs>
				<g clip-path="url(#brand-clip)">
					<rect width="64" height="64" fill="url(#brand-sky)" />
					<circle cx="48" cy="20" r="5" fill="#c47a3a" />
					<path
						d="M-2 40 L8 32 L16 36 L26 30 L36 34 L48 28 L56 32 L66 30 L66 48 L-2 48 Z"
						fill="#1e3a2c"
						opacity="0.65"
					/>
					<g fill="#ffffff">
						<rect x="14" y="10" width="6" height="30" />
						<polygon points="20,25 34,10 40,10 24,27" />
						<polygon points="20,25 24,24 40,40 34,40" />
					</g>
					<path
						d="M-2 48 L10 40 L22 46 L34 38 L46 44 L58 38 L66 42 L66 66 L-2 66 Z"
						fill="#1e3a2c"
					/>
					<path
						d="M-2 56 L18 48 L34 54 L52 46 L66 52 L66 66 L-2 66 Z"
						fill="#c47a3a"
						opacity="0.9"
					/>
				</g>
			</svg>
			<span class="brand-text">
				<span class="brand-name">alenj<span style="color: var(--accent)">.</span>in</span>
				<span class="brand-sub">Dictionary &amp; Corpus</span>
			</span>
		</a>
		<div class="topbar-nav-wrap" bind:this={navRoot}>
			<button
				type="button"
				class="nav-toggle"
				aria-label={navOpen ? 'Close menu' : 'Open menu'}
				aria-expanded={navOpen}
				aria-controls="primary-nav"
				onclick={toggleNav}
			>
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					{#if navOpen}
						<path d="M18 6 6 18" />
						<path d="m6 6 12 12" />
					{:else}
						<path d="M4 6h16" />
						<path d="M4 12h16" />
						<path d="M4 18h16" />
					{/if}
				</svg>
			</button>
			<nav
				id="primary-nav"
				class="topbar-nav"
				class:open={navOpen}
				aria-label="Primary navigation"
			>
				{#each navItems as item}
					<a
						href={item.href}
						class:active={isActive(item.href)}
						aria-current={isActive(item.href) ? 'page' : undefined}
						onclick={closeNav}
					>
						{item.label}
					</a>
				{/each}
			</nav>
		</div>
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
							{#if data.user.role === 'ADMIN' || data.user.role === 'MANAGER'}
								<a
									href="/admin/word-of-day"
									role="menuitem"
									class:active={isActive('/admin/word-of-day')}
									onclick={closeMenu}
								>
									Word of the day
								</a>
							{/if}
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

<Toast />
