<script lang="ts">
	import { enhance } from '$app/forms';
	import { stripWordLinks } from '$lib/word-links';

	type CoverageEntry = {
		word: { id: string; kalenjin: string; translations: string };
		introduced: boolean;
		sentences: { id: string; kalenjin: string; english: string; sentenceOrder: number }[];
	};

	let {
		title,
		entries,
		storyLesson = null,
		quickAddAction = null,
		open = $bindable(false)
	}: {
		title: string;
		entries: CoverageEntry[];
		storyLesson?: { id: string; title: string } | null;
		quickAddAction?: string | null;
		open?: boolean;
	} = $props();

	let showAll = $state(false);
	let addedWordIds = $state(new Set<string>());

	const uninstructedCount = $derived(entries.filter((e) => !e.introduced).length);
	const visibleEntries = $derived(showAll ? entries : entries.filter((e) => !e.introduced));

	function toggle() {
		open = !open;
		if (!open) showAll = false;
	}

	type EnhancedUpdate = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;

	function enhanceQuickAdd(wordId: string) {
		// SvelteKit enhance actions receive a submit callback, which can return the result handler.
		return () => async ({ result, update }: { result: { type: string }; update: EnhancedUpdate }) => {
			if (result.type === 'success') {
				addedWordIds = new Set([...addedWordIds, wordId]);
				await update({ invalidateAll: true });
			}
		};
	}
</script>

{#if entries.length}
	<section class="coverage-card">
		<div class="coverage-card-header">
			<button type="button" class="coverage-toggle" aria-expanded={open} onclick={toggle}>
				<strong>{title}</strong>
				<span class="coverage-chevron" aria-hidden="true">{open ? '▲' : '▼'}</span>
			</button>
			<p class="coverage-summary">
				{#if storyLesson}
					<a href={`/lessons/${storyLesson.id}`} class="story-link">{storyLesson.title}</a>
					·
				{/if}
				{#if uninstructedCount > 0}
					{uninstructedCount} of {entries.length} word{entries.length === 1 ? '' : 's'} not yet introduced
				{:else}
					All {entries.length} word{entries.length === 1 ? '' : 's'} introduced
				{/if}
			</p>
		</div>

		{#if open}
			<div class="coverage-filter">
				<label class="coverage-filter-label">
					<input type="checkbox" bind:checked={showAll} />
					Show introduced words
				</label>
			</div>
			<div class="coverage-list">
				{#each visibleEntries as entry}
					<div class="coverage-row" class:coverage-row--introduced={entry.introduced}>
						<div class="coverage-word">
							<a href={`/dictionary/${entry.word.id}`} class="coverage-word-link">
								{entry.word.kalenjin}
							</a>
							<span class="coverage-translations">{stripWordLinks(entry.word.translations)}</span>
						</div>
						<div class="coverage-sentences">
							{#each entry.sentences as sentence}
								<span class="coverage-sentence">{sentence.kalenjin}</span>
							{/each}
						</div>
						<div class="coverage-status">
							{#if entry.introduced || addedWordIds.has(entry.word.id)}
								<span class="status-introduced">✓ Introduced</span>
							{:else if quickAddAction}
								<form method="POST" action={quickAddAction} use:enhance={enhanceQuickAdd(entry.word.id)}>
									<input type="hidden" name="wordId" value={entry.word.id} />
									<button type="submit" class="add-button">+ Add to lesson</button>
								</form>
							{:else}
								<span class="status-missing">Not yet introduced</span>
							{/if}
						</div>
					</div>
				{/each}
				{#if visibleEntries.length === 0}
					<p class="coverage-empty">All words introduced.</p>
				{/if}
			</div>
		{/if}
	</section>
{/if}

<style>
	.coverage-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		overflow: hidden;
		padding: 1rem 1.25rem;
	}

	.coverage-card-header {
		display: grid;
		gap: 0.2rem;
	}

	.coverage-toggle {
		align-items: center;
		background: transparent;
		border: 0;
		color: var(--ink);
		cursor: pointer;
		display: flex;
		font: inherit;
		gap: 1rem;
		justify-content: space-between;
		padding: 0;
		text-align: left;
		width: 100%;
	}

	.coverage-toggle strong {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 500;
	}

	.coverage-toggle:hover .coverage-chevron {
		color: var(--ink);
	}

	.coverage-chevron {
		color: var(--ink-mute);
		flex-shrink: 0;
		font-size: 0.75rem;
	}

	.coverage-summary {
		color: var(--ink-soft);
		font-size: 14px;
		margin: 4px 0 0;
	}

	.story-link {
		color: var(--ink);
	}

	.story-link:hover {
		color: var(--brand);
	}

	.coverage-filter {
		border-top: 1px solid var(--line-soft);
		margin-top: 0.75rem;
		padding-top: 0.75rem;
	}

	.coverage-filter-label {
		align-items: center;
		color: var(--ink-soft);
		cursor: pointer;
		display: flex;
		font-size: 13px;
		gap: 0.4rem;
	}

	.coverage-empty {
		color: var(--ink-soft);
		font-size: 13px;
		margin: 0.5rem 0 0;
	}

	.coverage-list {
		border-top: 1px solid var(--line-soft);
		display: grid;
		gap: 0;
		margin-top: 0.75rem;
	}

	.coverage-row {
		align-items: center;
		border-top: 1px solid var(--line-soft);
		display: grid;
		gap: 1rem;
		grid-template-columns: minmax(160px, 1fr) minmax(0, 2fr) auto;
		padding: 12px 0;
	}

	.coverage-row:first-child {
		border-top: 0;
	}

	.coverage-row--introduced {
		opacity: 0.55;
	}

	.coverage-word {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.coverage-word-link {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 500;
		text-decoration: none;
	}

	.coverage-word-link:hover {
		color: var(--brand);
	}

	.coverage-translations {
		color: var(--ink-soft);
		font-size: 13px;
	}

	.coverage-sentences {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.coverage-sentence {
		color: var(--ink-soft);
		font-family: var(--font-display);
		font-size: 15px;
		font-style: italic;
	}

	.coverage-status {
		font-size: 13px;
		white-space: nowrap;
	}

	.status-introduced {
		color: oklch(0.45 0.15 150);
	}

	.add-button {
		align-items: center;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--brand);
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		gap: 4px;
		padding: 6px 12px;
		white-space: nowrap;
	}

	.add-button:hover {
		background: var(--accent-soft);
		border-color: var(--brand);
	}

	.status-missing {
		color: var(--ink-mute);
	}
</style>
