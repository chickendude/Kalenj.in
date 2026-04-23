<script lang="ts">
	import { onMount } from 'svelte';

	let {
		name = 'image',
		removeName = 'removeImage',
		currentUrl = null,
		label = 'Image',
		idPrefix = 'image',
		effectiveUrl = $bindable(null)
	}: {
		name?: string;
		removeName?: string;
		currentUrl?: string | null;
		label?: string;
		idPrefix?: string;
		effectiveUrl?: string | null;
	} = $props();

	const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

	let fileInput: HTMLInputElement | null = $state(null);
	let dropzone: HTMLDivElement | null = $state(null);
	let previewUrl: string | null = $state(null);
	let remove = $state(false);
	let dragActive = $state(false);
	let pasteTarget = $state(false);

	function acceptFile(file: File | null | undefined) {
		if (!file || !ACCEPTED.includes(file.type)) return;
		if (!fileInput) return;
		const dt = new DataTransfer();
		dt.items.add(file);
		fileInput.files = dt.files;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = URL.createObjectURL(file);
		remove = false;
	}

	function onFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = file ? URL.createObjectURL(file) : null;
		if (file) remove = false;
	}

	function clearFile() {
		if (fileInput) fileInput.value = '';
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
	}

	function onDragOver(event: DragEvent) {
		if (!event.dataTransfer) return;
		const hasFile = Array.from(event.dataTransfer.items ?? []).some(
			(item) => item.kind === 'file'
		);
		if (!hasFile) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
		dragActive = true;
	}

	function onDragLeave(event: DragEvent) {
		if (event.currentTarget === event.target) {
			dragActive = false;
		}
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		const file = event.dataTransfer?.files?.[0];
		acceptFile(file);
	}

	function extractImageFile(items: DataTransferItemList | undefined): File | null {
		if (!items) return null;
		for (const item of items) {
			if (item.kind === 'file' && ACCEPTED.includes(item.type)) {
				return item.getAsFile();
			}
		}
		return null;
	}

	onMount(() => {
		function handleDocPaste(event: ClipboardEvent) {
			if (!pasteTarget) return;
			const file = extractImageFile(event.clipboardData?.items);
			if (!file) return;
			event.preventDefault();
			acceptFile(file);
		}
		document.addEventListener('paste', handleDocPaste);
		return () => document.removeEventListener('paste', handleDocPaste);
	});

	const shownUrl = $derived(previewUrl ?? (remove ? null : currentUrl));
	$effect(() => {
		effectiveUrl = shownUrl;
	});
</script>

<div class="image-upload">
	<span class="label">{label}</span>
	<div
		bind:this={dropzone}
		class="dropzone"
		class:has-image={Boolean(shownUrl)}
		class:drag-active={dragActive}
		class:paste-target={pasteTarget}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		onmouseenter={() => (pasteTarget = true)}
		onmouseleave={() => (pasteTarget = false)}
		onfocusin={() => (pasteTarget = true)}
		onfocusout={() => (pasteTarget = false)}
		role="button"
		tabindex="0"
		onclick={() => fileInput?.click()}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				fileInput?.click();
			}
		}}
	>
		{#if shownUrl}
			<img src={shownUrl} alt="" class="preview" />
			<button
				type="button"
				class="trash"
				aria-label={previewUrl ? 'Clear selection' : 'Remove current image'}
				onclick={(e) => {
					e.stopPropagation();
					if (previewUrl) {
						clearFile();
					} else {
						remove = true;
					}
				}}
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M3 6h18" />
					<path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
					<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
					<path d="M10 11v6" />
					<path d="M14 11v6" />
				</svg>
			</button>
		{:else}
			<span class="hint">
				Drag and drop, click to browse, or paste from clipboard
			</span>
		{/if}
	</div>
	<input
		bind:this={fileInput}
		id="{idPrefix}-file"
		type="file"
		{name}
		accept="image/jpeg,image/png,image/webp,image/gif"
		onchange={onFileChange}
		class="file-input"
	/>
	{#if currentUrl && remove && !previewUrl}
		<input type="hidden" name={removeName} value="1" />
	{/if}
</div>

<style>
	.image-upload {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.label {
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--ink-soft);
	}
	.dropzone {
		position: relative;
		border: 1px dashed var(--line);
		border-radius: 6px;
		background: var(--bg-raised);
		color: var(--ink-soft);
		min-height: 80px;
		padding: 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
		outline: none;
	}
	.dropzone:hover,
	.dropzone.paste-target {
		border-color: var(--accent);
	}
	.dropzone:focus-visible {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent-soft);
	}
	.dropzone.drag-active {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.dropzone.has-image {
		padding: 0.25rem;
	}
	.hint {
		color: var(--ink-mute);
		font-size: 0.85rem;
	}
	.preview {
		max-width: 200px;
		max-height: 200px;
		object-fit: contain;
	}
	.trash {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		border: 0;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.15s;
	}
	.trash:hover {
		background: var(--danger, rgba(200, 60, 60, 0.9));
	}
	.trash svg {
		width: 18px;
		height: 18px;
	}
	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
