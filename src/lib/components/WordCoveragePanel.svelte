<script lang="ts">
	import { enhance } from '$app/forms';
	import { stripWordLinks } from '$lib/word-links';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';

	type CoverageEntry = {
		word: { id: string; kalenjin: string; translations: string };
		introduced: boolean;
		sentences: { id: string; kalenjin: string; english: string; sentenceOrder: number }[];
		otherLessons?: {
			id: string;
			title: string;
			level?: string;
			lessonOrder?: number;
			timing?: 'earlier' | 'later' | 'other';
		}[];
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
	let confirmedDuplicateWordId = $state<string | null>(null);
	let pendingDuplicateWord = $state<{ form: HTMLFormElement; entry: CoverageEntry } | null>(null);

	const uninstructedCount = $derived(entries.filter((e) => !e.introduced).length);
	const visibleEntries = $derived(showAll ? entries : entries.filter((e) => !e.introduced));

	function toggle() {
		open = !open;
		if (!open) showAll = false;
	}

	type EnhancedUpdate = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;

	function enhanceQuickAdd({
		cancel,
		formData,
		formElement
	}: {
		cancel: () => void;
		formData: FormData;
		formElement: HTMLFormElement;
	}) {
		const submittedWordId = String(formData.get('wordId') ?? '');
		const entry = entries.find((entry) => entry.word.id === submittedWordId);
		const earlierLessons = entry?.otherLessons?.filter((lesson) => lesson.timing === 'earlier') ?? [];
		if (entry && earlierLessons.length > 0 && confirmedDuplicateWordId !== submittedWordId) {
			cancel();
			pendingDuplicateWord = {
				form: formElement,
				entry: { ...entry, otherLessons: earlierLessons }
			};
			return;
		}
		confirmedDuplicateWordId = null;
		return async ({ result, update }: { result: { type: string }; update: EnhancedUpdate }) => {
			if (result.type === 'success' && submittedWordId) {
				addedWordIds = new Set([...addedWordIds, submittedWordId]);
				await update({ invalidateAll: true });
			} else {
				confirmedDuplicateWordId = null;
			}
		};
	}

	function confirmPendingDuplicate() {
		if (!pendingDuplicateWord) return;
		const { form, entry } = pendingDuplicateWord;
		pendingDuplicateWord = null;
		confirmedDuplicateWordId = entry.word.id;
		form.requestSubmit();
	}

	function cancelPendingDuplicate() {
		pendingDuplicateWord = null;
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
				{#each visibleEntries as entry (entry.word.id)}
					<div class="coverage-row" class:coverage-row--introduced={entry.introduced}>
						<div class="coverage-word">
							<a
								href={`/dictionary/${entry.word.id}`}
								class="coverage-word-link"
								class:coverage-word-link--usage-warning={entry.otherLessons?.some(
									(lesson) => lesson.timing === 'earlier'
								)}
							>
								{entry.word.kalenjin}
							</a>
							<span class="coverage-translations">{stripWordLinks(entry.word.translations)}</span>
						</div>
						<div class="coverage-sentences">
							{#each entry.sentences as sentence}
								<span class="coverage-sentence"><SentenceTimeText text={sentence.kalenjin} /></span>
							{/each}
						</div>
						<div class="coverage-status">
							{#if entry.introduced || addedWordIds.has(entry.word.id)}
								<span class="status-introduced">✓ Introduced</span>
							{:else if quickAddAction}
								{#if entry.otherLessons?.some((lesson) => lesson.timing === 'earlier')}
									{@const earlierLessons = entry.otherLessons.filter(
										(lesson) => lesson.timing === 'earlier'
									)}
									<div class="coverage-duplicate-warning">
										<span>
											Taught in
											{#each earlierLessons as lesson, index}
												<a href={`/lessons/${lesson.id}`} target="_blank" rel="noopener"
													>{lesson.title}</a
												>{#if index < earlierLessons.length - 1}, {/if}
											{/each}.
										</span>
									</div>
								{/if}
								<form
									method="POST"
									action={quickAddAction}
									use:enhance={enhanceQuickAdd}
								>
									<input type="hidden" name="wordId" value={entry.word.id} />
									<button type="submit" class="add-button">
										{entry.otherLessons?.some((lesson) => lesson.timing === 'earlier') && confirmedDuplicateWordId !== entry.word.id
											? '+ Add anyway'
											: '+ Add to lesson'}
									</button>
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

<ConfirmDialog
	open={pendingDuplicateWord !== null}
	title="Word taught in another lesson"
	message={pendingDuplicateWord
		? `"${pendingDuplicateWord.entry.word.kalenjin}" is taught in ${(pendingDuplicateWord.entry.otherLessons ?? []).map((l) => `"${l.title}"`).join(', ')}. Add it to this lesson anyway?`
		: ''}
	confirmLabel="Add anyway"
	onconfirm={confirmPendingDuplicate}
	oncancel={cancelPendingDuplicate}
/>

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
		align-items: start;
		border-top: 1px solid var(--line-soft);
		display: grid;
		gap: 1rem;
		grid-template-columns: minmax(160px, 1fr) minmax(0, 2fr) minmax(0, 180px);
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

	.coverage-word-link--usage-warning {
		color: oklch(0.56 0.12 25);
		font-weight: 700;
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

	.coverage-duplicate-warning {
		color: oklch(0.45 0.15 25);
		font-size: 13px;
		font-weight: 600;
		margin-bottom: 8px;
		text-align: left;
		white-space: normal;
	}

	.coverage-duplicate-warning a {
		color: var(--brand);
		font-weight: 600;
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
