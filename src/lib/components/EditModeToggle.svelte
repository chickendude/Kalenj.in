<script lang="ts">
	import Tooltip from '$lib/components/Tooltip.svelte';
	import { getEditMode } from '$lib/stores/editMode.svelte';

	const editMode = getEditMode();

	function handleChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		editMode.set(target.checked);
	}

	const tooltipLabel = $derived(
		editMode.value ? 'Editing controls visible. Click to hide.' : 'Editing controls hidden. Click to show.'
	);
</script>

<Tooltip label={tooltipLabel}>
	<label class="edit-mode-toggle">
		<input
			type="checkbox"
			checked={editMode.value}
			onchange={handleChange}
			aria-label="Toggle edit mode"
		/>
		<span class="toggle-track" aria-hidden="true">
			<span class="toggle-thumb"></span>
		</span>
		<span class="toggle-label">Edit mode</span>
	</label>
</Tooltip>

<style>
	.edit-mode-toggle {
		align-items: center;
		cursor: pointer;
		display: inline-flex;
		gap: 8px;
		user-select: none;
	}
	.edit-mode-toggle input {
		appearance: none;
		height: 0;
		margin: 0;
		opacity: 0;
		position: absolute;
		width: 0;
	}
	.toggle-track {
		background: var(--surface, #e5e7eb);
		border: 1px solid var(--line);
		border-radius: 999px;
		display: inline-block;
		height: 18px;
		position: relative;
		transition: background 0.15s, border-color 0.15s;
		width: 32px;
	}
	.toggle-thumb {
		background: var(--paper, white);
		border-radius: 50%;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
		display: block;
		height: 14px;
		left: 1px;
		position: absolute;
		top: 1px;
		transition: transform 0.15s;
		width: 14px;
	}
	.edit-mode-toggle input:checked + .toggle-track {
		background: var(--brand);
		border-color: var(--brand);
	}
	.edit-mode-toggle input:checked + .toggle-track .toggle-thumb {
		transform: translateX(14px);
	}
	.edit-mode-toggle input:focus-visible + .toggle-track {
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--brand) 25%, transparent);
	}
	.toggle-label {
		color: var(--ink-soft);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
</style>
