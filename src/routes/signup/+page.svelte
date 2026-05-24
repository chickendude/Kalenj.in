<script lang="ts">
	import { enhance } from '$app/forms';
	import FormErrorFeedback from '$lib/components/FormErrorFeedback.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showPassword = $state(false);
</script>

<svelte:head>
	<title>Create account · Kalenjin</title>
</svelte:head>

<div class="auth-shell">
	<div class="auth-card">
		<h1>Create account</h1>
		<p class="auth-sub">
			Already have an account? <a href="/login">Sign in</a>.
		</p>

		<FormErrorFeedback error={form?.error} />

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
				<p class="field-hint">2–40 characters: letters, digits, _ . -</p>
			</div>

			<div class="field">
				<label for="email">Email</label>
				<input
					id="email"
					name="email"
					type="email"
					class="input"
					autocomplete="email"
					required
					value={form?.email ?? ''}
				/>
				<p class="field-hint">We'll send a verification link to confirm it's yours.</p>
			</div>

			<div class="field">
				<label for="displayName">Display name <span class="optional">(optional)</span></label>
				<input
					id="displayName"
					name="displayName"
					class="input"
					autocomplete="nickname"
					value={form?.displayName ?? ''}
				/>
			</div>

			<div class="field">
				<label for="password">Password</label>
				<div class="password-wrap">
					<input
						id="password"
						name="password"
						type={showPassword ? 'text' : 'password'}
						class="input"
						autocomplete="new-password"
						required
						minlength={12}
					/>
					<button
						type="button"
						class="password-toggle"
						aria-label={showPassword ? 'Hide password' : 'Show password'}
						aria-pressed={showPassword}
						onclick={() => (showPassword = !showPassword)}
					>
						{#if showPassword}
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								width="18"
								height="18"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path
									d="M3 3l18 18M10.6 6.2A10 10 0 0 1 12 6c5 0 9 4 10 6a13 13 0 0 1-3.2 4M6.2 7.8C3.7 9.6 2 12 2 12s3 6 10 6c1.7 0 3.2-.3 4.5-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"
								/>
							</svg>
						{:else}
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								width="18"
								height="18"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M2 12s3-6 10-6 10 6 10 6-3 6-10 6S2 12 2 12z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
						{/if}
					</button>
				</div>
				<p class="field-hint">At least 12 characters.</p>
			</div>

			<div class="field">
				<label for="confirmPassword">Confirm password</label>
				<input
					id="confirmPassword"
					name="confirmPassword"
					type={showPassword ? 'text' : 'password'}
					class="input"
					autocomplete="new-password"
					required
					minlength={12}
				/>
			</div>

			<div class="actions">
				<button type="submit" class="btn">Create account</button>
			</div>
		</form>
	</div>
</div>

<style>
	.password-wrap {
		position: relative;
	}
	.password-wrap .input {
		width: 100%;
		padding-right: 44px;
		box-sizing: border-box;
	}
	.password-toggle {
		position: absolute;
		top: 50%;
		right: 6px;
		transform: translateY(-50%);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		background: transparent;
		border: 0;
		border-radius: 6px;
		color: var(--ink-mute);
		cursor: pointer;
		transition: color 0.15s, background-color 0.15s;
	}
	.password-toggle:hover {
		color: var(--ink);
		background: color-mix(in oklch, var(--ink) 8%, transparent);
	}
	.password-toggle:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: 2px;
	}
	.field-hint {
		margin: 4px 0 0;
		font-size: 0.85rem;
		color: var(--ink-mute);
	}
	.optional {
		color: var(--ink-mute);
		font-weight: normal;
	}
</style>
