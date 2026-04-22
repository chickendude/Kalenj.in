<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const totalDuplicates = $derived(
		data.groups.reduce((sum, g) => sum + g.sentences.length, 0)
	);

	function formatDate(value: string | Date): string {
		const d = value instanceof Date ? value : new Date(value);
		return d.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function confirmSubmit(message: string) {
		return ({ cancel }: { cancel: () => void }) => {
			if (!confirm(message)) cancel();
		};
	}
</script>

<svelte:head>
	<title>Duplicate sentences — Kalenj.in</title>
</svelte:head>

<section>
	<div class="page-head">
		<div>
			<div class="page-kicker">
				<a href="/corpus">← Corpus</a>
			</div>
			<h1>Duplicate sentences</h1>
			<p>
				Sentences grouped by matching Kalenjin text (case- and whitespace-insensitive).
				Review each group and delete redundant entries. Deleting a sentence used in a
				lesson just unlinks it; sentences sourced from a story are owned by the story
				and cannot be deleted here.
			</p>
		</div>
		<div class="page-stat">
			<b>{data.groups.length}</b>
			group{data.groups.length === 1 ? '' : 's'}
			· <b>{totalDuplicates}</b>
			sentence{totalDuplicates === 1 ? '' : 's'}
		</div>
	</div>

	{#if form?.error}
		<p class="error-banner">{form.error}</p>
	{/if}

	{#if form && 'deletedCount' in form && form.deletedCount}
		<p class="success-banner">
			Deleted {form.deletedCount} sentence{form.deletedCount === 1 ? '' : 's'}.
			{#if form.skippedCount}
				Skipped {form.skippedCount} linked to a lesson or story.
			{/if}
		</p>
	{/if}

	{#if data.groups.length === 0}
		<div class="empty">No duplicate sentences found. 🎉</div>
	{:else}
		<ul class="group-list">
			{#each data.groups as group (group.key)}
				{@const groupDeletable = group.sentences.filter((s) => !s.storySentence)}
				<li class="group-card">
					<div class="group-head">
						<div class="group-kal" class:is-empty={!group.kalenjin.trim()}>
							{group.kalenjin.trim() || '(empty sentence)'}
						</div>
						<div class="group-head-right">
							<div class="group-count">{group.sentences.length} copies</div>
							<form
								method="POST"
								action="?/deleteSentences"
								use:enhance={confirmSubmit(
									`Delete all ${group.sentences.length} copies in this group? In-use sentences will be skipped.`
								)}
							>
								{#each group.sentences as s (s.id)}
									<input type="hidden" name="ids" value={s.id} />
								{/each}
								<button
									type="submit"
									class="btn danger xs"
									disabled={groupDeletable.length === 0}
									title={groupDeletable.length === 0
										? 'All copies are sourced from a story'
										: `Delete all ${groupDeletable.length} deletable copies`}
								>
									Delete all
								</button>
							</form>
						</div>
					</div>
					<ul class="sentence-list">
						{#each group.sentences as sentence (sentence.id)}
							{@const lessonUse = sentence.lessonWords[0]}
							{@const storyLesson = sentence.storySentence?.story?.lesson}
							{@const fromStory = Boolean(sentence.storySentence)}
							{@const inUse = sentence.lessonWords.length > 0 || fromStory}
							{@const otherIds = group.sentences
								.filter((s) => s.id !== sentence.id)
								.map((s) => s.id)}
							{@const otherDeletableCount = group.sentences.filter(
								(s) => s.id !== sentence.id && !s.storySentence
							).length}
							<li class="sentence-row">
								<div class="sentence-body">
									<div class="kal" class:is-empty={!sentence.kalenjin.trim()}>
										{sentence.kalenjin.trim() || '(empty)'}
									</div>
									<div class="en" class:is-empty={!sentence.english.trim()}>
										{sentence.english.trim() || '(empty)'}
									</div>
									{#if sentence.notes}
										<div class="notes">{sentence.notes}</div>
									{/if}
									<div class="meta">
										<span>Added {formatDate(sentence.createdAt)}</span>
										<span>·</span>
										<span>{sentence._count.tokens} token{sentence._count.tokens === 1 ? '' : 's'}</span>
										{#if lessonUse}
											<span>·</span>
											<span class="tag tag-lesson">
												Lesson:
												<a href={`/lessons/${lessonUse.lessonSection.lesson.id}`}>
													{lessonUse.lessonSection.lesson.title}
												</a>
												{#if sentence.lessonWords.length > 1}
													<span class="extra">+{sentence.lessonWords.length - 1}</span>
												{/if}
											</span>
										{/if}
										{#if sentence.storySentence}
											<span>·</span>
											<span class="tag tag-story">
												Story: {sentence.storySentence.story.title}
												{#if storyLesson}
													(<a href={`/lessons/${storyLesson.id}`}>{storyLesson.title}</a>)
												{/if}
											</span>
										{/if}
										{#if !inUse}
											<span>·</span>
											<span class="tag tag-free">Not linked</span>
										{/if}
									</div>
								</div>
								<div class="sentence-actions">
									<a class="btn ghost sm" href={`/corpus/${sentence.id}`}>Open</a>
									<form
										method="POST"
										action="?/deleteSentences"
										use:enhance={confirmSubmit(
											'Delete this sentence? This cannot be undone.'
										)}
									>
										<input type="hidden" name="ids" value={sentence.id} />
										<button
											type="submit"
											class="btn danger sm"
											disabled={fromStory}
											title={fromStory
												? 'This sentence is sourced from a story and cannot be deleted here'
												: 'Delete this sentence'}
										>
											Delete
										</button>
									</form>
									<form
										method="POST"
										action="?/deleteSentences"
										use:enhance={confirmSubmit(
											`Delete the other ${otherIds.length} cop${otherIds.length === 1 ? 'y' : 'ies'}, keeping this sentence? In-use sentences will be skipped.`
										)}
									>
										{#each otherIds as otherId (otherId)}
											<input type="hidden" name="ids" value={otherId} />
										{/each}
										<button
											type="submit"
											class="btn danger sm outline"
											disabled={otherDeletableCount === 0}
											title={otherDeletableCount === 0
												? 'All other copies are sourced from a story'
												: `Delete ${otherDeletableCount} other cop${otherDeletableCount === 1 ? 'y' : 'ies'}, keep this one`}
										>
											Delete others
										</button>
									</form>
								</div>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.page-kicker a {
		color: var(--ink-soft);
		text-decoration: none;
	}
	.page-kicker a:hover {
		color: var(--ink);
	}

	.error-banner {
		background: color-mix(in oklch, var(--danger, #c0392b) 10%, transparent);
		border: 1px solid color-mix(in oklch, var(--danger, #c0392b) 30%, transparent);
		color: var(--danger, #c0392b);
		padding: 10px 14px;
		border-radius: var(--radius);
		margin-bottom: 16px;
	}
	.success-banner {
		background: color-mix(in oklch, var(--brand) 10%, transparent);
		border: 1px solid color-mix(in oklch, var(--brand) 30%, transparent);
		color: var(--brand);
		padding: 10px 14px;
		border-radius: var(--radius);
		margin-bottom: 16px;
	}

	.empty {
		padding: 40px;
		text-align: center;
		color: var(--ink-soft);
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
	}

	.group-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.group-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 10px 14px;
	}

	.group-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding-bottom: 6px;
		border-bottom: 1px solid var(--line-soft);
		margin-bottom: 4px;
	}
	.group-head-right {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.group-kal {
		font-family: var(--font-display);
		font-size: 15px;
		color: var(--ink);
	}
	.group-kal.is-empty,
	.kal.is-empty,
	.en.is-empty {
		color: var(--ink-mute);
		font-style: italic;
	}
	.group-count {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--ink-mute);
	}

	.sentence-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.sentence-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		padding: 6px 0;
		border-bottom: 1px solid var(--line-soft);
	}
	.sentence-row:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}

	.sentence-body {
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 10px;
		row-gap: 2px;
	}
	.sentence-body .kal {
		font-family: var(--font-display);
		font-size: 14px;
		color: var(--ink);
	}
	.sentence-body .en {
		color: var(--ink-soft);
		font-size: 13px;
	}
	.sentence-body .notes {
		color: var(--ink-mute);
		font-size: 12px;
		font-style: italic;
	}

	.meta {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--ink-mute);
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		flex-basis: 100%;
	}
	.meta a {
		color: var(--brand);
		text-decoration: none;
	}
	.meta a:hover {
		text-decoration: underline;
	}

	.tag {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px 6px;
		border-radius: 999px;
		border: 1px solid var(--line);
	}
	.tag-lesson {
		background: color-mix(in oklch, var(--brand) 8%, transparent);
	}
	.tag-story {
		background: color-mix(in oklch, var(--accent, #d58b3a) 8%, transparent);
	}
	.tag-free {
		color: var(--ink-soft);
	}
	.tag .extra {
		color: var(--ink-mute);
	}

	.sentence-actions {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 4px;
	}

	.btn.danger {
		background: color-mix(in oklch, var(--danger, #c0392b) 15%, transparent);
		border-color: color-mix(in oklch, var(--danger, #c0392b) 40%, transparent);
		color: var(--danger, #c0392b);
	}
	.btn.danger:hover:not(:disabled) {
		background: color-mix(in oklch, var(--danger, #c0392b) 25%, transparent);
	}
	.btn.danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn.danger.outline {
		background: transparent;
	}
	.btn.xs {
		font-size: 11px;
		padding: 3px 8px;
	}

	@media (max-width: 720px) {
		.sentence-row {
			grid-template-columns: 1fr;
		}
		.sentence-actions {
			flex-direction: row;
			align-items: flex-start;
		}
	}
</style>
