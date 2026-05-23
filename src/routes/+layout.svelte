<script lang="ts">
	import { page, navigating } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import { theme, toggleTheme } from '$lib/stores/theme';
	import Toast from '$lib/components/Toast.svelte';
	import NavSearch from '$lib/components/NavSearch.svelte';
	import '../app.css';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	const year = new Date().getFullYear();

	const navItems = $derived.by(() => {
		const items = [
			{ href: '/dictionary', label: 'Dictionary' },
			{ href: '/corpus', label: 'Corpus' }
		];
		if (data.user) {
			items.push({ href: '/lessons', label: 'Lessons' });
		}
		return items;
	});

	const canAddWord = $derived(
		data.user?.role === 'ADMIN' || data.user?.role === 'MANAGER'
	);

	function isActive(href: string): boolean {
		if (href === '/') {
			return page.url.pathname === '/';
		}

		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}

	let userMenuOpen = $state(false);
	let userMenuRoot: HTMLDivElement | undefined = $state();
	let sideMenuOpen = $state(false);
	let sideMenuRoot: HTMLDivElement | undefined = $state();

	function toggleUserMenu() {
		userMenuOpen = !userMenuOpen;
	}

	function closeUserMenu() {
		userMenuOpen = false;
	}

	function toggleSideMenu() {
		sideMenuOpen = !sideMenuOpen;
	}

	function closeSideMenu() {
		sideMenuOpen = false;
	}

	function handleSideMenuTheme() {
		toggleTheme();
		closeSideMenu();
	}

	$effect(() => {
		if (!userMenuOpen) return;

		function onPointerDown(event: PointerEvent) {
			if (userMenuRoot && !userMenuRoot.contains(event.target as Node)) {
				userMenuOpen = false;
			}
		}
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') userMenuOpen = false;
		}

		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKey);
		};
	});

	$effect(() => {
		if (!sideMenuOpen) return;

		function onPointerDown(event: PointerEvent) {
			if (sideMenuRoot && !sideMenuRoot.contains(event.target as Node)) {
				sideMenuOpen = false;
			}
		}
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') sideMenuOpen = false;
		}

		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

{#snippet userMenuLinks(onSelect: () => void)}
	{#if data.user}
		<a
			href="/settings"
			role="menuitem"
			class:active={isActive('/settings')}
			onclick={onSelect}
		>
			Settings
		</a>
		{#if data.user.role === 'ADMIN' || data.user.role === 'MANAGER'}
			<a
				href="/admin/word-of-day"
				role="menuitem"
				class:active={isActive('/admin/word-of-day')}
				onclick={onSelect}
			>
				Word of the day
			</a>
			<a
				href="/admin/cleanup"
				role="menuitem"
				class:active={isActive('/admin/cleanup')}
				onclick={onSelect}
			>
				Cleanup
			</a>
			<a
				href="/dictionary/record-audio"
				role="menuitem"
				class:active={isActive('/dictionary/record-audio')}
				onclick={onSelect}
			>
				Record word audio
			</a>
			<a
				href="/corpus/record-audio"
				role="menuitem"
				class:active={isActive('/corpus/record-audio')}
				onclick={onSelect}
			>
				Record sentence audio
			</a>
			<a
				href="/corpus/duplicates"
				role="menuitem"
				class:active={isActive('/corpus/duplicates')}
				onclick={onSelect}
			>
				Check duplicates
			</a>
		{/if}
		{#if data.user.role === 'ADMIN'}
			<a
				href="/admin/users"
				role="menuitem"
				class:active={isActive('/admin/users')}
				onclick={onSelect}
			>
				Admin
			</a>
		{/if}
		<form method="POST" action="/logout">
			<button type="submit" role="menuitem" class="user-menu-item">Sign out</button>
		</form>
	{:else if page.url.pathname !== '/login'}
		<a href="/login" role="menuitem" onclick={onSelect}>Sign in</a>
	{/if}
{/snippet}

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if navigating?.to}
	<div class="nav-progress" role="presentation" aria-hidden="true"></div>
{/if}


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
		<NavSearch {canAddWord} />
		<nav id="primary-nav" class="topbar-nav" aria-label="Primary navigation">
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
		{#if !data.user}
			<button
				type="button"
				class="theme-toggle desktop-only"
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
		{/if}
		<div class="topbar-user desktop-only">
			{#if data.user}
				<div class="user-menu" bind:this={userMenuRoot}>
					<button
						type="button"
						class="user-menu-trigger"
						aria-haspopup="menu"
						aria-expanded={userMenuOpen}
						onclick={toggleUserMenu}
					>
						<span class="who">{data.user.username}</span>
						<span class="caret" aria-hidden="true">▾</span>
					</button>
					{#if userMenuOpen}
						<div class="user-menu-panel" role="menu">
							{@render userMenuLinks(closeUserMenu)}
						</div>
					{/if}
				</div>
			{:else if page.url.pathname !== '/login'}
				<a href="/login">Sign in</a>
			{/if}
		</div>
		<div class="side-menu mobile-only" bind:this={sideMenuRoot}>
			<button
				type="button"
				class="side-menu-toggle"
				aria-label={sideMenuOpen ? 'Close menu' : 'Open menu'}
				aria-expanded={sideMenuOpen}
				aria-controls="side-menu-panel"
				onclick={toggleSideMenu}
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
					{#if sideMenuOpen}
						<path d="M18 6 6 18" />
						<path d="m6 6 12 12" />
					{:else}
						<path d="M4 6h16" />
						<path d="M4 12h16" />
						<path d="M4 18h16" />
					{/if}
				</svg>
			</button>
			{#if sideMenuOpen}
				<div id="side-menu-panel" class="side-menu-panel" role="menu">
					{#each navItems as item}
						<a
							href={item.href}
							role="menuitem"
							class:active={isActive(item.href)}
							aria-current={isActive(item.href) ? 'page' : undefined}
							onclick={closeSideMenu}
						>
							{item.label}
						</a>
					{/each}
					<div class="side-menu-divider" role="presentation"></div>
					{#if data.user}
						<div class="side-menu-user">{data.user.username}</div>
					{:else}
						<button
							type="button"
							role="menuitem"
							class="user-menu-item"
							onclick={handleSideMenuTheme}
						>
							{$theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
						</button>
					{/if}
					{@render userMenuLinks(closeSideMenu)}
				</div>
			{/if}
		</div>
	</div>
</header>

<main class="shell">
	{@render children()}
</main>

{#if page.url.pathname !== '/login'}
	<footer class="site-foot mono">
		<div class="site-foot-inner">
			<p class="site-foot-lede">
				Kalenj.in is a project to document and record the <em>kutitab myot</em> — the language
				of sweetness — and provide resources for natives, heritage speakers, and learners of the
				Kalenjin language.
			</p>

			<p class="site-foot-meta">
				<span class="site-foot-phrase"
					>Kongoi missing en inye ne inetegee Kalenjin, kinetegee tugul mutyo mutyo</span
				>
				<span aria-hidden="true"> · </span>
				<span>&copy; {year}</span>
				<span aria-hidden="true"> · </span>
				<a href="/terms">Terms</a>
			</p>
		</div>
	</footer>
{/if}

<Toast />

<style>
	.nav-progress {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 2px;
		z-index: 100;
		background: color-mix(in oklch, var(--brand) 25%, transparent);
		overflow: hidden;
	}
	.nav-progress::after {
		content: '';
		position: absolute;
		inset: 0;
		width: 40%;
		background: var(--brand);
		animation: nav-progress-slide 1s ease-in-out infinite;
	}
	@keyframes nav-progress-slide {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(350%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.nav-progress::after {
			animation: none;
			width: 100%;
			opacity: 0.6;
		}
	}
</style>
