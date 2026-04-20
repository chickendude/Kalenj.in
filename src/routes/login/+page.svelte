<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign in · Kalenjin</title>
</svelte:head>

<div class="auth-shell">
	<div class="auth-card">
		<h1>Sign in</h1>
		<p class="auth-sub">Editor and admin access only.</p>

		{#if form?.error}
			<div class="form-feedback error">{form.error}</div>
		{/if}

		<form method="POST" use:enhance class="auth-form">
			<input type="hidden" name="redirectTo" value={data.redirectTo} />

			<div class="field">
				<label for="username">Username</label>
				<input
					id="username"
					name="username"
					class="input"
					autocomplete="username"
					required
					value={form?.username ?? ''}
				/>
			</div>

			<div class="field">
				<label for="password">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					class="input"
					autocomplete="current-password"
					required
				/>
			</div>

			<div class="actions">
				<button type="submit" class="btn">Sign in</button>
			</div>
		</form>
	</div>
</div>
