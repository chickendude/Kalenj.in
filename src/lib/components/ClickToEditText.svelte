<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		value,
		label,
		rows = 1,
		requiredMessage = 'Value is required.',
		preserveHeight = false,
		children,
		onSave
	}: {
		value: string;
		label: string;
		rows?: number;
		requiredMessage?: string;
		preserveHeight?: boolean;
		children?: Snippet;
		onSave: (value: string) => Promise<void> | void;
	} = $props();

	let editing = $state(false);
	let draft = $state('');
	let error = $state<string | null>(null);
	let saving = $state(false);
	let displayButton = $state<HTMLButtonElement | null>(null);
	let input = $state<HTMLTextAreaElement | null>(null);
	let editorHeight = $state<number | null>(null);
	const editorStyle = $derived(
		editorHeight ? `min-height: ${editorHeight}px; height: ${editorHeight}px;` : undefined
	);

	$effect(() => {
		if (!editing) {
			draft = value;
		}
	});

	$effect(() => {
		if (!editing) return;
		const timeout = window.setTimeout(() => {
			input?.focus();
			input?.select();
		}, 0);
		return () => window.clearTimeout(timeout);
	});

	function beginEdit() {
		draft = value;
		error = null;
		editorHeight = preserveHeight ? (displayButton?.offsetHeight ?? 0) + 2 || null : null;
		editing = true;
	}

	function cancelEdit() {
		editing = false;
		draft = value;
		error = null;
		editorHeight = null;
	}

	async function saveEdit() {
		if (saving) return;
		const trimmedValue = draft.trim();
		if (!trimmedValue) {
			error = requiredMessage;
			return;
		}
		if (trimmedValue === value) {
			cancelEdit();
			return;
		}

		try {
			saving = true;
			await onSave(trimmedValue);
			editing = false;
			error = null;
			editorHeight = null;
		} catch (saveError) {
			error = saveError instanceof Error ? saveError.message : 'Could not save.';
		} finally {
			saving = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void saveEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelEdit();
		}
	}
</script>

{#if editing}
	<div class="click-edit-frame" style={editorStyle}>
		<textarea
			bind:this={input}
			bind:value={draft}
			aria-label={label}
			class="click-edit-input"
			{rows}
			onblur={() => void saveEdit()}
			onkeydown={handleKeydown}
		></textarea>
	</div>
	{#if error}
		<p class="click-edit-error">{error}</p>
	{/if}
{:else}
	<button
		bind:this={displayButton}
		type="button"
		class="click-edit-display"
		onclick={beginEdit}
	>
		{#if children}
			{@render children()}
		{:else}
			{value}
		{/if}
	</button>
{/if}

<style>
	.click-edit-display {
		background: transparent;
		border: 0;
		color: inherit;
		cursor: text;
		display: block;
		font: inherit;
		line-height: inherit;
		margin: 0;
		padding: 0;
		text-align: left;
		width: 100%;
	}

	.click-edit-display:hover,
	.click-edit-display:focus-visible {
		background: color-mix(in oklab, var(--surface) 55%, transparent);
		border-radius: 4px;
		outline: none;
	}

	.click-edit-frame {
		align-items: stretch;
		display: flex;
		width: 100%;
	}

	.click-edit-input {
		background: transparent;
		border: 0;
		border-radius: 4px;
		box-sizing: border-box;
		color: inherit;
		display: block;
		font: inherit;
		line-height: inherit;
		margin: 0;
		min-height: calc(1lh + 2px);
		overflow: hidden;
		padding: 1px 2px;
		resize: none;
		width: 100%;
	}

	.click-edit-input:focus {
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--brand) 28%, transparent);
		outline: none;
	}

	.click-edit-error {
		color: var(--danger);
		font-size: 13px;
		margin: 6px 0 0;
	}
</style>
