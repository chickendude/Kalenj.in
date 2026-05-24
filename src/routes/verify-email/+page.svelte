<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Email verification · Kalenjin</title>
</svelte:head>

<div class="auth-shell">
	<div class="auth-card">
		<h1>Verification failed</h1>
		<p>
			{#if data.reason === 'expired'}
				This link has expired. Sign in to request a new one, or
				<a href="/signup">create a new account</a>.
			{:else}
				This verification link is invalid or has already been used.
				<a href="/login">Sign in</a> if you've already verified.
			{/if}
		</p>
	</div>
</div>
