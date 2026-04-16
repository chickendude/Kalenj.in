<script lang="ts">
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

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

<header>
	<nav>
		<a href="/" class:active={isActive('/')} aria-current={isActive('/') ? 'page' : undefined}>Home</a>
		<a
			href="/dictionary"
			class:active={isActive('/dictionary')}
			aria-current={isActive('/dictionary') ? 'page' : undefined}
		>
			Dictionary
		</a>
		<a
			href="/corpus"
			class:active={isActive('/corpus')}
			aria-current={isActive('/corpus') ? 'page' : undefined}
		>
			Corpus
		</a>
		<a
			href="/cefr"
			class:active={isActive('/cefr')}
			aria-current={isActive('/cefr') ? 'page' : undefined}
		>
			CEFR
		</a>
		<a
			href="/lessons"
			class:active={isActive('/lessons')}
			aria-current={isActive('/lessons') ? 'page' : undefined}
		>
			Lessons
		</a>
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

	a {
		border-bottom: 2px solid transparent;
		color: #334155;
		padding-bottom: 0.15rem;
		text-decoration: none;
	}

	a:hover {
		color: #0f172a;
	}

	a.active {
		border-bottom-color: #2563eb;
		color: #0f172a;
		font-weight: 600;
	}

	main {
		margin: 0 auto;
		max-width: 960px;
		padding: 1.5rem 1rem;
	}
</style>
