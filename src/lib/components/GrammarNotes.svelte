<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';

	let {
		source = '',
		onSave
	}: {
		source?: string;
		onSave: (value: string) => Promise<void>;
	} = $props();

	let editing = $state(false);
	let expanded = $state(false);
	let draft = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);
	let overflows = $state(false);
	let preview = $state<HTMLDivElement | null>(null);

	const rendered = $derived(renderMarkdown(source));
	const draftRendered = $derived(renderMarkdown(draft));

	$effect(() => {
		if (editing || !preview) return;
		// rendered is a reactivity signal
		void rendered;
		queueMicrotask(() => {
			if (!preview) return;
			overflows = preview.scrollHeight > preview.clientHeight + 1;
		});
	});

	function startEdit() {
		draft = source;
		error = null;
		editing = true;
	}

	function cancelEdit() {
		editing = false;
		error = null;
	}

	async function save() {
		saving = true;
		error = null;
		try {
			await onSave(draft);
			editing = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not save grammar notes.';
		} finally {
			saving = false;
		}
	}
</script>

<section class="grammar-notes" class:grammar-notes--editing={editing}>
	<header class="grammar-notes-header">
		<div class="grammar-notes-label">Grammar notes</div>
		{#if !editing}
			<button type="button" class="btn ghost btn-edit" onclick={startEdit}>Edit</button>
		{/if}
	</header>

	{#if editing}
		<div class="grammar-editor">
			<div class="grammar-editor-pane">
				<label class="pane-label" for="grammar-markdown-input">Markdown</label>
				<textarea
					id="grammar-markdown-input"
					class="grammar-textarea"
					bind:value={draft}
					rows="16"
					placeholder="Write grammar notes in markdown..."
				></textarea>
			</div>
			<div class="grammar-editor-pane">
				<span class="pane-label">Preview</span>
				<div class="grammar-preview grammar-preview--editor markdown-body">
					{#if draft.trim()}
						{@html draftRendered}
					{:else}
						<p class="empty-preview">Nothing to preview yet.</p>
					{/if}
				</div>
			</div>
		</div>

		{#if error}
			<p class="error-text">{error}</p>
		{/if}

		<div class="grammar-actions">
			<button type="button" class="btn" onclick={save} disabled={saving}>
				{saving ? 'Saving...' : 'Save'}
			</button>
			<button type="button" class="btn ghost" onclick={cancelEdit} disabled={saving}>
				Cancel
			</button>
		</div>
	{:else if source.trim()}
		<div
			bind:this={preview}
			class="grammar-preview markdown-body"
			class:grammar-preview--collapsed={!expanded}
		>
			{@html rendered}
		</div>
		{#if overflows || expanded}
			<button
				type="button"
				class="expand-button"
				onclick={() => (expanded = !expanded)}
				aria-expanded={expanded}
			>
				{expanded ? 'Show less' : 'Show more'}
			</button>
		{/if}
	{:else}
		<button type="button" class="empty-add" onclick={startEdit}>
			Add grammar notes
		</button>
	{/if}
</section>

<style>
	.grammar-notes {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		display: grid;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
	}

	.grammar-notes-header {
		align-items: center;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}

	.grammar-notes-label {
		color: var(--ink);
		font-size: 14px;
		font-weight: 600;
	}

	.btn-edit {
		padding: 6px 14px;
		font-size: 13px;
	}

	.grammar-preview {
		line-height: 1.55;
		max-width: 72ch;
		overflow: hidden;
		position: relative;
	}

	.grammar-preview--collapsed {
		max-height: 5.5rem;
		mask-image: linear-gradient(to bottom, #000 60%, transparent);
		-webkit-mask-image: linear-gradient(to bottom, #000 60%, transparent);
	}

	.expand-button {
		background: transparent;
		border: 0;
		color: var(--brand);
		cursor: pointer;
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		justify-self: start;
		padding: 0;
		text-align: left;
	}

	.expand-button:hover {
		text-decoration: underline;
	}

	.grammar-editor {
		display: grid;
		gap: 1rem;
	}

	.grammar-editor-pane {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}

	.pane-label {
		color: var(--ink-soft);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.grammar-textarea {
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 13px;
		line-height: 1.5;
		min-height: 16rem;
		padding: 0.6rem 0.75rem;
		resize: vertical;
		width: 100%;
	}

	.grammar-textarea:focus {
		border-color: var(--brand);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand) 18%, transparent);
		outline: none;
	}

	.grammar-preview.markdown-body {
		padding: 0;
	}

	.grammar-preview--editor.markdown-body {
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		max-height: none;
		min-height: 16rem;
		padding: 0.65rem 0.85rem;
	}

	.empty-preview {
		color: var(--ink-mute);
		margin: 0;
	}

	.grammar-actions {
		display: flex;
		gap: 0.5rem;
	}

	.empty-add {
		background: transparent;
		border: 1px dashed var(--line);
		border-radius: var(--radius);
		color: var(--ink-mute);
		cursor: pointer;
		font: inherit;
		font-size: 14px;
		justify-self: start;
		padding: 0.6rem 0.9rem;
		text-align: left;
	}

	.empty-add:hover {
		border-color: var(--ink-mute);
		color: var(--ink);
	}

	.error-text {
		color: var(--danger);
		font-weight: 600;
		margin: 0;
	}

	:global(.markdown-body h1),
	:global(.markdown-body h2),
	:global(.markdown-body h3),
	:global(.markdown-body h4),
	:global(.markdown-body h5),
	:global(.markdown-body h6) {
		line-height: 1.25;
		margin: 1em 0 0.4em;
	}

	:global(.markdown-body h1:first-child),
	:global(.markdown-body h2:first-child),
	:global(.markdown-body h3:first-child) {
		margin-top: 0;
	}

	:global(.markdown-body h1) {
		font-size: 1.5rem;
	}

	:global(.markdown-body h2) {
		font-size: 1.3rem;
	}

	:global(.markdown-body h3) {
		font-size: 1.1rem;
	}

	:global(.markdown-body p) {
		margin: 0.5em 0;
	}

	:global(.markdown-body ul),
	:global(.markdown-body ol) {
		margin: 0.5em 0;
		padding-left: 1.5em;
	}

	:global(.markdown-body li) {
		margin: 0.2em 0;
	}

	:global(.markdown-body blockquote) {
		border-left: 3px solid var(--border-strong);
		color: var(--ink-soft);
		margin: 0.5em 0;
		padding: 0.1em 0.9em;
	}

	:global(.markdown-body code) {
		background: var(--surface);
		border-radius: 3px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.9em;
		padding: 0.1em 0.3em;
	}

	:global(.markdown-body pre) {
		background: var(--surface);
		border-radius: 4px;
		overflow-x: auto;
		padding: 0.75em 0.9em;
	}

	:global(.markdown-body pre code) {
		background: transparent;
		padding: 0;
	}

	:global(.markdown-body a) {
		color: var(--info);
		text-decoration: underline;
	}

	:global(.markdown-body hr) {
		border: 0;
		border-top: 1px solid var(--line);
		margin: 1em 0;
	}

	@media (min-width: 900px) {
		.grammar-editor {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
