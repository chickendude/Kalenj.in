<script lang="ts">
	import { enhance } from '$app/forms';
	import FormErrorFeedback from '$lib/components/FormErrorFeedback.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import {
		themePreference,
		setThemePreference,
		type ThemePreference
	} from '$lib/stores/theme';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	$effect(() => {
		if (form && 'success' in form && form.success) toast.success(form.success);
	});

	$effect(() => {
		if (form && 'themeError' in form && form.themeError) toast.show(form.themeError);
	});

	const themeOptions: { value: ThemePreference; label: string }[] = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	function pickTheme(pref: ThemePreference): void {
		setThemePreference(pref, { persist: 'none' });
	}
</script>

<svelte:head>
	<title>Settings · Kalenjin</title>
</svelte:head>

<div class="page-head">
	<div>
		<div class="page-kicker">Settings</div>
		<h1>Settings</h1>
		<p>Manage your account and how Kalenj.in looks on this device.</p>
	</div>
</div>

<section class="form-card" style="max-width: 520px;">
	<h2>Account</h2>
	<dl class="settings-info">
		<div>
			<dt>Username</dt>
			<dd>{data.user.username}</dd>
		</div>
		<div>
			<dt>Role</dt>
			<dd>{data.user.role.toLowerCase()}</dd>
		</div>
	</dl>
</section>

<section class="form-card" style="max-width: 520px;">
	<h2>Appearance</h2>
	<form method="POST" action="?/setTheme" use:enhance class="field">
		<span class="settings-label">Theme</span>
		<div class="theme-picker" role="radiogroup" aria-label="Theme">
			{#each themeOptions as option}
				<button
					type="submit"
					name="pref"
					value={option.value}
					role="radio"
					aria-checked={$themePreference === option.value}
					class:active={$themePreference === option.value}
					onclick={() => pickTheme(option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>
		<small class="muted">Auto follows your device setting. Saved to your account.</small>
	</form>
</section>

<section class="form-card" style="max-width: 520px;">
	<h2>Change password</h2>

	<FormErrorFeedback error={form && 'error' in form ? form.error : null} />

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

<style>
	.settings-info {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 6px 16px;
		margin: 0;
	}
	.settings-info > div {
		display: contents;
	}
	.settings-info dt {
		color: var(--ink-mute);
		font-size: 13px;
	}
	.settings-info dd {
		margin: 0;
		font-weight: 500;
	}
	.settings-label {
		display: block;
		font-size: 13px;
		color: var(--ink-mute);
		margin-bottom: 8px;
	}
	.theme-picker {
		display: inline-flex;
		width: max-content;
		max-width: 100%;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 3px;
		background: var(--bg-raised);
		gap: 3px;
	}
	.theme-picker button {
		appearance: none;
		background: transparent;
		border: 0;
		color: var(--ink-soft);
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		padding: 6px 12px;
		border-radius: calc(var(--radius) - 3px);
		cursor: pointer;
	}
	.theme-picker button:hover:not(.active) {
		background: var(--surface);
		color: var(--ink);
	}
	.theme-picker button.active {
		background: var(--brand);
		color: var(--on-brand);
	}
	.theme-picker + .muted {
		display: block;
		margin-top: 8px;
	}
</style>
