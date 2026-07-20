<script lang="ts">
	import { enhance } from '$app/forms';
	import FormErrorFeedback from '$lib/components/FormErrorFeedback.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let resetOpenFor = $state<string | null>(null);
	let editOpenFor = $state<string | null>(null);
	let editFocus = $state<'username' | 'displayName'>('username');

	function startEdit(userId: string, field: 'username' | 'displayName') {
		editOpenFor = userId;
		editFocus = field;
		resetOpenFor = null;
	}

	// Focus (and select) the field the user clicked once its input renders.
	function focusField(node: HTMLInputElement, enabled: boolean) {
		if (enabled) node.select();
	}

	function onEditKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') editOpenFor = null;
	}

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
	$effect(() => {
		if (form && 'roleSuccess' in form && form.roleSuccess) toast.success(form.roleSuccess);
	});
	$effect(() => {
		if (form && 'updateSuccess' in form && form.updateSuccess) {
			toast.success(form.updateSuccess);
			editOpenFor = null;
		}
	});

	function editValues(u: {
		id: string;
		username: string;
		displayName: string | null;
	}): { username: string; displayName: string | null } {
		if (
			form &&
			'updateUserId' in form &&
			form.updateUserId === u.id &&
			'updateForm' in form &&
			form.updateForm
		) {
			// ActionData collapses the variant's object type; the shape is fixed above.
			return form.updateForm as { username: string; displayName: string | null };
		}
		return { username: u.username, displayName: u.displayName };
	}
</script>

<svelte:head>
	<title>Users · Admin</title>
</svelte:head>

<section class="form-card">
	<h2>New user</h2>

	<FormErrorFeedback error={form && 'createError' in form ? form.createError : null} />

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

<FormErrorFeedback error={form && 'updateError' in form ? form.updateError : null} />
<FormErrorFeedback error={form && 'resetError' in form ? form.resetError : null} />
<FormErrorFeedback error={form && 'deleteError' in form ? form.deleteError : null} />
<FormErrorFeedback error={form && 'roleError' in form ? form.roleError : null} />

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
				{#if editOpenFor === u.id}
					{@const values = editValues(u)}
					<td>
						<input
							name="username"
							form="edit-user-{u.id}"
							class="input"
							aria-label={`Username for ${u.username}`}
							autocomplete="off"
							required
							value={values.username}
							use:focusField={editFocus === 'username'}
							onkeydown={onEditKeydown}
						/>
					</td>
					<td>
						<input
							name="displayName"
							form="edit-user-{u.id}"
							class="input"
							aria-label={`Display name for ${u.username}`}
							placeholder="Display name"
							value={values.displayName ?? ''}
							use:focusField={editFocus === 'displayName'}
							onkeydown={onEditKeydown}
						/>
					</td>
				{:else}
					<td>
						<button
							type="button"
							class="cell-edit"
							aria-label={`Edit username for ${u.username}`}
							onclick={() => startEdit(u.id, 'username')}><strong>{u.username}</strong></button
						>
					</td>
					<td>
						<button
							type="button"
							class="cell-edit"
							class:muted={!u.displayName}
							aria-label={`Edit display name for ${u.username}`}
							onclick={() => startEdit(u.id, 'displayName')}>{u.displayName ?? '—'}</button
						>
					</td>
				{/if}
				<td>
					{#if u.id === data.user?.id}
						<span class="role-pill {u.role.toLowerCase()}">{u.role}</span>
					{:else}
						<form method="POST" action="?/changeRole" use:enhance>
							<input type="hidden" name="userId" value={u.id} />
							<select
								name="role"
								class="select"
								value={u.role}
								aria-label={`Role for ${u.username}`}
								onchange={(event) => event.currentTarget.form?.requestSubmit()}
							>
								<option value="ADMIN">Admin</option>
								<option value="MANAGER">Manager</option>
								<option value="USER">User</option>
							</select>
						</form>
					{/if}
				</td>
				<td>{dateFmt.format(u.createdAt)}</td>
				<td>
					<div class="row-actions">
						{#if editOpenFor === u.id}
							<form id="edit-user-{u.id}" method="POST" action="?/updateUser" use:enhance class="inline-form">
								<input type="hidden" name="userId" value={u.id} />
								<button type="submit" class="btn-sm">Save</button>
								<button
									type="button"
									class="btn-sm ghost"
									onclick={() => (editOpenFor = null)}>Cancel</button
								>
							</form>
						{:else if resetOpenFor === u.id}
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

<style>
	.cell-edit {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.cell-edit:hover,
	.cell-edit:focus-visible {
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}

	.cell-edit.muted {
		color: var(--ink-mute);
	}
</style>
