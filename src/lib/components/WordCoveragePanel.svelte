<script lang="ts">
	import { enhance } from '$app/forms';

	type CoverageEntry = {
		word: { id: string; kalenjin: string; translations: string };
		introduced: boolean;
		sentences: { id: string; kalenjin: string; sentenceOrder: number }[];
	};

	let {
		title,
		entries,
		storyLesson = null,
		quickAddAction = null
	}: {
		title: string;
		entries: CoverageEntry[];
		storyLesson?: { id: string; title: string } | null;
		quickAddAction?: string | null;
	} = $props();

	let showPanel = $state(false);
	let showAll = $state(false);
	let addedWordIds = $state(new Set<string>());

	const uninstructedCount = $derived(entries.filter((e) => !e.introduced).length);
	const visibleEntries = $derived(showAll ? entries : entries.filter((e) => !e.introduced));

	function toggle() {
		showPanel = !showPanel;
		if (!showPanel) showAll = false;
	}

	type EnhancedUpdate = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;

	function enhanceQuickAdd(wordId: string) {
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
			<button type="button" class="coverage-toggle" onclick={toggle}>
				<strong>{title}</strong>
				<span class="coverage-chevron" aria-hidden="true">{showPanel ? '▲' : '▼'}</span>
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

		{#if showPanel}
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
							<span class="coverage-translations">{entry.word.translations}</span>
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
		border: 1px solid #e2e2e2;
		padding: 1rem;
	}

	.coverage-card-header {
		display: grid;
		gap: 0.2rem;
		margin-bottom: 0.75rem;
	}

	.coverage-toggle {
		align-items: center;
		background: transparent;
		border: 0;
		cursor: pointer;
		display: flex;
		font: inherit;
		gap: 1rem;
		justify-content: space-between;
		padding: 0;
		text-align: left;
		width: 100%;
	}

	.coverage-toggle:hover .coverage-chevron {
		color: #111;
	}

	.coverage-chevron {
		color: #888;
		flex-shrink: 0;
		font-size: 0.75rem;
	}

	.coverage-summary {
		color: #555;
		margin: 0;
	}

	.story-link {
		color: inherit;
	}

	.coverage-filter {
		margin-top: 0.75rem;
	}

	.coverage-filter-label {
		align-items: center;
		cursor: pointer;
		display: flex;
		font-size: 0.9rem;
		gap: 0.4rem;
	}

	.coverage-empty {
		color: #555;
		font-size: 0.9rem;
		margin: 0.5rem 0 0;
	}

	.coverage-list {
		border-top: 1px solid #eee;
		display: grid;
		gap: 0;
		margin-top: 0.75rem;
	}

	.coverage-row {
		align-items: start;
		border-top: 1px solid #eee;
		display: grid;
		gap: 0.75rem;
		grid-template-columns: minmax(160px, 1fr) minmax(0, 2fr) auto;
		padding: 0.6rem 0;
	}

	.coverage-row:first-child {
		border-top: 0;
	}

	.coverage-row--introduced {
		opacity: 0.45;
	}

	.coverage-word {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.coverage-word-link {
		color: inherit;
		font-weight: 600;
		text-decoration: none;
	}

	.coverage-word-link:hover {
		text-decoration: underline;
	}

	.coverage-translations {
		color: #555;
		font-size: 0.9rem;
	}

	.coverage-sentences {
		display: flex;
		flex-direction: column;
		font-size: 0.9rem;
		gap: 0.25rem;
	}

	.coverage-sentence {
		color: #444;
	}

	.coverage-status {
		font-size: 0.85rem;
		white-space: nowrap;
	}

	.status-introduced {
		color: #1a7f37;
	}

	.add-button {
		background: transparent;
		border: 1px solid #d0d0d0;
		cursor: pointer;
		font: inherit;
		font-size: 0.85rem;
		padding: 0.2rem 0.45rem;
		white-space: nowrap;
	}

	.add-button:hover {
		background: #f0f0f0;
	}

	.status-missing {
		color: #92400e;
	}
</style>
