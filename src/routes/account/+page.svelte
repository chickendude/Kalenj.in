<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from '$lib/stores/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	$effect(() => {
		if (form && 'success' in form && form.success) toast.success(form.success);
	});
</script>

<svelte:head>
	<title>Account · Kalenjin</title>
</svelte:head>

<div class="page-head">
	<div>
		<div class="page-kicker">Account</div>
		<h1>Your account</h1>
		<p>Signed in as <strong>{data.user.username}</strong> · {data.user.role.toLowerCase()}</p>
	</div>
</div>

<section class="form-card" style="max-width: 520px;">
	<h2>Change password</h2>

	{#if form && 'error' in form && form.error}
		<div class="form-feedback error">{form.error}</div>
	{/if}

	<form method="POST" action="?/changePassword" use:enhance class="auth-form">
		<div class="field">
			<label for="currentPassword">Current password</label>
			<input
				id="currentPassword"
				name="currentPassword"
				type="password"
				class="input"
				autocomplete="current-password"
				required
			/>
		</div>
		<div class="field">
			<label for="newPassword">New password</label>
			<input
				id="newPassword"
				name="newPassword"
				type="password"
				class="input"
				autocomplete="new-password"
				minlength="12"
				aria-describedby="newPasswordHelp"
				required
			/>
			<small id="newPasswordHelp" class="muted">At least 12 characters.</small>
		</div>
		<div class="field">
			<label for="confirmPassword">Confirm new password</label>
			<input
				id="confirmPassword"
				name="confirmPassword"
				type="password"
				class="input"
				autocomplete="new-password"
				minlength="12"
				required
			/>
		</div>
		<div class="actions">
			<button type="submit" class="btn">Update password</button>
		</div>
	</form>
</section>
