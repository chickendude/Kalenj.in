<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from '$lib/stores/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let resetOpenFor = $state<string | null>(null);

	const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	$effect(() => {
		if (form && 'createSuccess' in form && form.createSuccess) toast.success(form.createSuccess);
	});
	$effect(() => {
		if (form && 'resetSuccess' in form && form.resetSuccess) toast.success(form.resetSuccess);
	});
	$effect(() => {
		if (form && 'deleteSuccess' in form && form.deleteSuccess) toast.success(form.deleteSuccess);
	});
</script>

<svelte:head>
	<title>Users · Admin</title>
</svelte:head>

<div class="page-head">
	<div>
		<div class="page-kicker">Admin</div>
		<h1>Users</h1>
		<p>Create new editors and admins, or reset their passwords.</p>
	</div>
	<div class="page-stat">
		<b>{data.users.length}</b>
		account{data.users.length === 1 ? '' : 's'}
	</div>
</div>

<section class="form-card">
	<h2>New user</h2>

	{#if form && 'createError' in form && form.createError}
		<div class="form-feedback error">{form.createError}</div>
	{/if}

	<form method="POST" action="?/createUser" use:enhance class="form-grid">
		<div class="field">
			<label for="username">Username</label>
			<input
				id="username"
				name="username"
				class="input"
				autocomplete="off"
				required
				value={(form && 'createForm' in form && form.createForm?.username) || ''}
			/>
		</div>
		<div class="field">
			<label for="displayName">Display name (optional)</label>
			<input
				id="displayName"
				name="displayName"
				class="input"
				value={(form && 'createForm' in form && form.createForm?.displayName) || ''}
			/>
		</div>
		<div class="field">
			<label for="role">Role</label>
			<select id="role" name="role" class="select" required>
				<option value="MANAGER" selected={form && 'createForm' in form && form.createForm?.role !== 'ADMIN'}>Manager</option>
				<option value="ADMIN" selected={form && 'createForm' in form && form.createForm?.role === 'ADMIN'}>Admin</option>
			</select>
		</div>
		<div class="field">
			<label for="password">Initial password</label>
			<input
				id="password"
				name="password"
				type="password"
				class="input"
				autocomplete="new-password"
				minlength="12"
				required
			/>
		</div>
		<div class="actions">
			<button type="submit" class="btn">Create user</button>
		</div>
	</form>
</section>

{#if form && 'resetError' in form && form.resetError}
	<div class="form-feedback error">{form.resetError}</div>
{/if}
{#if form && 'deleteError' in form && form.deleteError}
	<div class="form-feedback error">{form.deleteError}</div>
{/if}

<table class="users-table">
	<thead>
		<tr>
			<th>Username</th>
			<th>Display name</th>
			<th>Role</th>
			<th>Created</th>
			<th></th>
		</tr>
	</thead>
	<tbody>
		{#each data.users as u (u.id)}
			<tr>
				<td><strong>{u.username}</strong></td>
				<td>{u.displayName ?? '—'}</td>
				<td>
					<span class="role-pill {u.role === 'ADMIN' ? 'admin' : 'manager'}">{u.role}</span>
				</td>
				<td>{dateFmt.format(u.createdAt)}</td>
				<td>
					<div class="row-actions">
						{#if resetOpenFor === u.id}
							<form method="POST" action="?/resetPassword" use:enhance class="inline-form">
								<input type="hidden" name="userId" value={u.id} />
								<input
									name="newPassword"
									type="password"
									class="input"
									placeholder="New password"
									autocomplete="new-password"
									minlength="12"
									required
								/>
								<button type="submit" class="btn-sm">Set</button>
								<button
									type="button"
									class="btn-sm ghost"
									onclick={() => (resetOpenFor = null)}>Cancel</button
								>
							</form>
						{:else}
							<button
								type="button"
								class="btn-sm ghost"
								onclick={() => (resetOpenFor = u.id)}>Reset password</button
							>
							{#if u.id !== data.user?.id}
								<form
									method="POST"
									action="?/deleteUser"
									use:enhance={() => async ({ update }) => {
										await update();
									}}
								>
									<input type="hidden" name="userId" value={u.id} />
									<button
										type="submit"
										class="btn-sm danger"
										onclick={(event) => {
											if (!confirm(`Delete user "${u.username}"?`)) event.preventDefault();
										}}>Delete</button
									>
								</form>
							{/if}
						{/if}
					</div>
				</td>
			</tr>
		{/each}
	</tbody>
</table>
