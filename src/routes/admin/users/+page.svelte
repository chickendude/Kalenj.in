<script lang="ts">
	import { enhance } from '$app/forms';
	import FormErrorFeedback from '$lib/components/FormErrorFeedback.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let resetOpenFor = $state<string | null>(null);
	let editing = $state<{ userId: string; field: 'username' | 'displayName' } | null>(null);

	function startEdit(userId: string, field: 'username' | 'displayName') {
		editing = { userId, field };
		resetOpenFor = null;
	}

	function isEditing(userId: string, field: 'username' | 'displayName'): boolean {
		return editing?.userId === userId && editing.field === field;
	}

	// Focus and select the clicked field once its input renders.
	function focusField(node: HTMLInputElement) {
		node.select();
	}

	function onEditKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') editing = null;
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
			editing = null;
		}
	});

	function editValue(
		u: { id: string; username: string; displayName: string | null },
		field: 'username' | 'displayName'
	): string {
		if (
			form &&
			'updateUserId' in form &&
			form.updateUserId === u.id &&
			'updateForm' in form &&
			form.updateForm
		) {
			// ActionData collapses the variant's object type; the shape is fixed above.
			const saved = form.updateForm as { username: string; displayName: string | null };
			return field === 'username' ? saved.username : (saved.displayName ?? '');
		}
		return field === 'username' ? u.username : (u.displayName ?? '');
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
				<td class="editable-cell">
					<button
						type="button"
						class="cell-edit"
						class:hidden-while-editing={isEditing(u.id, 'username')}
						aria-label={`Edit username for ${u.username}`}
						onclick={() => startEdit(u.id, 'username')}><strong>{u.username}</strong></button
					>
					{#if isEditing(u.id, 'username')}
						<form method="POST" action="?/updateUser" use:enhance class="cell-overlay">
							<input type="hidden" name="userId" value={u.id} />
							<input type="hidden" name="displayName" value={u.displayName ?? ''} />
							<input
								name="username"
								class="cell-input strong"
								aria-label={`Username for ${u.username}`}
								autocomplete="off"
								required
								value={editValue(u, 'username')}
								use:focusField
								onkeydown={onEditKeydown}
								onblur={() => (editing = null)}
							/>
						</form>
					{/if}
				</td>
				<td class="editable-cell">
					<button
						type="button"
						class="cell-edit"
						class:muted={!u.displayName}
						class:hidden-while-editing={isEditing(u.id, 'displayName')}
						aria-label={`Edit display name for ${u.username}`}
						onclick={() => startEdit(u.id, 'displayName')}>{u.displayName ?? '—'}</button
					>
					{#if isEditing(u.id, 'displayName')}
						<form method="POST" action="?/updateUser" use:enhance class="cell-overlay">
							<input type="hidden" name="userId" value={u.id} />
							<input type="hidden" name="username" value={u.username} />
							<input
								name="displayName"
								class="cell-input"
								aria-label={`Display name for ${u.username}`}
								placeholder="Display name"
								value={editValue(u, 'displayName')}
								use:focusField
								onkeydown={onEditKeydown}
								onblur={() => (editing = null)}
							/>
						</form>
					{/if}
				</td>
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

	.editable-cell {
		position: relative;
	}

	/* While editing, the text button keeps its space (so the table's column
	   and row geometry cannot move) and the input floats above it,
	   spreadsheet-style. left 6px + input border/padding = the cell's own
	   14px text inset, so the glyphs stay exactly in place. */
	.cell-edit.hidden-while-editing {
		visibility: hidden;
	}

	.cell-overlay {
		position: absolute;
		top: 50%;
		left: 6px;
		transform: translateY(-50%);
		width: 220px;
		margin: 0;
		z-index: 1;
	}

	.cell-input {
		box-sizing: border-box;
		width: 100%;
		padding: 3px 7px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg);
		box-shadow: 0 2px 10px rgb(0 0 0 / 0.25);
		font: inherit;
		color: inherit;
	}

	.cell-input.strong {
		font-weight: 650;
	}

	.cell-input:focus {
		outline: none;
		border-color: color-mix(in oklch, var(--accent) 55%, var(--line));
	}
</style>
