<script lang="ts">
	import { enhance } from '$app/forms';
	import FormErrorFeedback from '$lib/components/FormErrorFeedback.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Check your email · Kalenjin</title>
</svelte:head>

<div class="auth-shell">
	<div class="auth-card">
		<h1>Check your email</h1>
		<p>
			We sent a verification link to
			<strong>{form?.email ?? data.email}</strong>. Open it within 24 hours to activate
			your account and sign in.
		</p>

		<FormErrorFeedback error={form?.error} />

		{#if form?.resent}
			<p class="form-feedback success">If that email is on file, we sent another link.</p>
		{/if}

		<form method="POST" action="?/resend" use:enhance class="auth-form">
			<input type="hidden" name="email" value={form?.email ?? data.email} />
			<div class="actions">
				<button type="submit" class="btn">Resend verification email</button>
			</div>
		</form>

		<p class="auth-sub">
			Wrong address? <a href="/signup">Start over</a> · Already verified?
			<a href="/login">Sign in</a>
		</p>
	</div>
</div>

<style>
	.form-feedback.success {
		color: var(--brand);
	}
</style>
