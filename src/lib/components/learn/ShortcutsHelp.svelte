<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';

	let {
		open,
		context = 'lesson',
		onclose
	}: {
		open: boolean;
		context?: 'lesson' | 'review';
		onclose: () => void;
	} = $props();

	const COMMON = [
		{ keys: ['A'], action: 'Play the sentence audio' },
		{ keys: ['T'], action: 'Show / hide the translation' },
		{ keys: ['H'], action: 'Hint — reveal the next letter (typing drills)' },
		{ keys: ['Enter'], action: 'Check your typed answer' },
		{ keys: ['?'], action: 'Show this list' }
	];

	const LESSON = [
		{ keys: ['Enter', '→'], action: 'Continue to the next step' },
		{ keys: ['←'], action: 'Go back a step' }
	];

	const REVIEW = [{ keys: ['1', '2', '3', '4'], action: 'Grade the card (Again / Hard / Good / Easy)' }];

	const rows = $derived(context === 'lesson' ? [...LESSON, ...COMMON] : [...REVIEW, ...COMMON]);
</script>

<Modal {open} title="Keyboard shortcuts" labelledBy="shortcuts-help-title" {onclose}>
	<p class="shortcuts-note">Letter shortcuts work whenever you're not typing an answer.</p>
	<dl class="shortcuts-list">
		{#each rows as row (row.action)}
			<dt>
				{#each row.keys as key, i (key)}
					{#if i > 0}<span class="key-sep">/</span>{/if}
					<kbd>{key}</kbd>
				{/each}
			</dt>
			<dd>{row.action}</dd>
		{/each}
	</dl>
</Modal>

<style>
	.shortcuts-note {
		color: var(--ink-mute);
		font-size: 13.5px;
		margin: 0;
	}

	.shortcuts-list {
		display: grid;
		gap: 0.55rem 1rem;
		grid-template-columns: auto 1fr;
		margin: 0;
	}

	dt {
		align-items: center;
		display: flex;
		gap: 0.25rem;
		justify-content: flex-end;
	}

	dd {
		color: var(--ink-soft);
		font-size: 14px;
		margin: 0;
	}

	kbd {
		background: color-mix(in oklab, var(--line) 40%, transparent);
		border: 1px solid var(--line);
		border-bottom-width: 2px;
		border-radius: 5px;
		color: var(--ink);
		font-family: var(--font-mono, monospace);
		font-size: 12px;
		min-width: 1.6em;
		padding: 0.1rem 0.4rem;
		text-align: center;
	}

	.key-sep {
		color: var(--ink-mute);
		font-size: 12px;
	}
</style>
