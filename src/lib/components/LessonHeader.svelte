<script lang="ts">
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import {
		VOCABULARY_LESSON_TYPES,
		formatLessonType,
		formatVocabularyLessonType
	} from '$lib/course';
	import BackLink from '$lib/components/BackLink.svelte';

	type LessonType = 'VOCABULARY' | 'STORY';
	type VocabularyType = '' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION';
	type LessonNavEntry = {
		id: string;
		title: string;
		lessonOrder: number;
		type: LessonType;
	};
	type AdjacentLesson = { id: string; title: string } | null;

	let {
		lessonId,
		lessonOrder,
		lessonType,
		lessonTitle = $bindable(),
		lessonVocabularyType = $bindable(),
		prevLesson,
		nextLesson,
		levelLessons,
		onSaveField,
		onDeleteRequest
	}: {
		lessonId: string;
		lessonOrder: number;
		lessonType: LessonType;
		lessonTitle: string;
		lessonVocabularyType: VocabularyType;
		prevLesson: AdjacentLesson;
		nextLesson: AdjacentLesson;
		levelLessons: LessonNavEntry[];
		onSaveField: (field: 'title' | 'vocabularyType', value: string) => Promise<void>;
		onDeleteRequest: (event: SubmitEvent) => void;
	} = $props();

	let titleEditing = $state(false);
	let titleDraft = $state('');
	let titleInput = $state<HTMLInputElement | null>(null);
	let titleError = $state<string | null>(null);
	let titleSaving = $state(false);
	let vocabularyTypeError = $state<string | null>(null);
	let vocabTypeOpen = $state(false);
	let vocabTypeWrap = $state<HTMLSpanElement | null>(null);
	let lessonNavOpen = $state(false);
	let lessonNavWrap = $state<HTMLSpanElement | null>(null);

	beforeNavigate(() => {
		lessonNavOpen = false;
		vocabTypeOpen = false;
	});

	$effect(() => {
		if (!titleEditing) return;
		const timeout = window.setTimeout(() => {
			titleInput?.focus();
			titleInput?.select();
		}, 0);
		return () => window.clearTimeout(timeout);
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		window.addEventListener('mousedown', handleVocabTypeWindowClick);
		window.addEventListener('keydown', handleVocabTypeWindowKey);
		window.addEventListener('mousedown', handleLessonNavWindowClick);
		window.addEventListener('keydown', handleLessonNavWindowKey);
		return () => {
			window.removeEventListener('mousedown', handleVocabTypeWindowClick);
			window.removeEventListener('keydown', handleVocabTypeWindowKey);
			window.removeEventListener('mousedown', handleLessonNavWindowClick);
			window.removeEventListener('keydown', handleLessonNavWindowKey);
		};
	});

	function startTitleEdit() {
		titleDraft = lessonTitle;
		titleError = null;
		titleEditing = true;
	}

	function cancelTitleEdit() {
		titleEditing = false;
		titleError = null;
	}

	async function saveTitleEdit() {
		if (titleSaving) return;
		const next = titleDraft.trim();
		if (!next) {
			titleError = 'Title is required.';
			return;
		}
		if (next === lessonTitle) {
			titleEditing = false;
			return;
		}
		titleSaving = true;
		try {
			await onSaveField('title', next);
			lessonTitle = next;
			titleEditing = false;
			await invalidateAll();
		} catch (err) {
			titleError = err instanceof Error ? err.message : 'Could not save title.';
		} finally {
			titleSaving = false;
		}
	}

	function handleTitleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void saveTitleEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelTitleEdit();
		}
	}

	async function setVocabularyType(next: VocabularyType) {
		vocabTypeOpen = false;
		if (lessonType !== 'VOCABULARY') return;
		if (!next || next === lessonVocabularyType) return;
		vocabularyTypeError = null;
		const previous = lessonVocabularyType;
		lessonVocabularyType = next;
		try {
			await onSaveField('vocabularyType', next);
			await invalidateAll();
		} catch (err) {
			lessonVocabularyType = previous;
			vocabularyTypeError = err instanceof Error ? err.message : 'Could not change vocabulary type.';
		}
	}

	function handleVocabTypeWindowClick(event: MouseEvent) {
		if (!vocabTypeOpen) return;
		const target = event.target;
		if (vocabTypeWrap && target instanceof Node && vocabTypeWrap.contains(target)) return;
		vocabTypeOpen = false;
	}

	function handleVocabTypeWindowKey(event: KeyboardEvent) {
		if (event.key === 'Escape' && vocabTypeOpen) {
			vocabTypeOpen = false;
		}
	}

	function handleLessonNavWindowClick(event: MouseEvent) {
		if (!lessonNavOpen) return;
		const target = event.target;
		if (lessonNavWrap && target instanceof Node && lessonNavWrap.contains(target)) return;
		lessonNavOpen = false;
	}

	function handleLessonNavWindowKey(event: KeyboardEvent) {
		if (event.key === 'Escape' && lessonNavOpen) {
			lessonNavOpen = false;
		}
	}
</script>

<div class="lesson-head-row">
	<div class="page-header-main">
		<BackLink href="/lessons" label="Back to lessons" />
		<div class="kicker">
			{#if lessonType === 'VOCABULARY'}
				{@const currentVocabType = lessonVocabularyType || 'VOCAB'}
				<span class="vocab-type-select-wrap" bind:this={vocabTypeWrap}>
					<button
						type="button"
						class="vocab-type-trigger"
						aria-haspopup="listbox"
						aria-expanded={vocabTypeOpen}
						onclick={() => (vocabTypeOpen = !vocabTypeOpen)}
					>
						<span class="vocab-type-label">
							{formatVocabularyLessonType(currentVocabType)}
						</span>
					</button>
					{#if vocabTypeOpen}
						<ul class="vocab-type-menu" role="listbox">
							{#each VOCABULARY_LESSON_TYPES as option}
								<li>
									<button
										type="button"
										role="option"
										aria-selected={option === currentVocabType}
										class="vocab-type-option"
										class:vocab-type-option--selected={option === currentVocabType}
										onclick={() => void setVocabularyType(option)}
									>
										{formatVocabularyLessonType(option)}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</span>
			{:else}
				{formatLessonType(lessonType)} lesson
			{/if}
			·
			{#if prevLesson}
				<a
					href="/lessons/{prevLesson.id}"
					class="lesson-nav-icon"
					aria-label={`Previous lesson: ${prevLesson.title}`}
					title={`Previous lesson: ${prevLesson.title}`}
				>
					←
				</a>
			{/if}
			<span class="lesson-nav-select-wrap" bind:this={lessonNavWrap}>
				<button
					type="button"
					class="lesson-nav-trigger"
					aria-haspopup="listbox"
					aria-expanded={lessonNavOpen}
					onclick={() => (lessonNavOpen = !lessonNavOpen)}
				>
					Lesson {lessonOrder}
				</button>
				{#if lessonNavOpen}
					<ul class="lesson-nav-menu" role="listbox">
						{#each levelLessons as entry}
							{@const isCurrent = entry.id === lessonId}
							<li>
								{#if isCurrent}
									<span
										class="lesson-nav-option lesson-nav-option--current"
										class:lesson-nav-option--vocab={entry.type === 'VOCABULARY'}
										class:lesson-nav-option--story={entry.type === 'STORY'}
										aria-current="true"
									>
										<span class="lesson-nav-option-number">{entry.lessonOrder}.</span>
										<span class="lesson-nav-option-title">{entry.title}</span>
									</span>
								{:else}
									<a
										href="/lessons/{entry.id}"
										role="option"
										aria-selected="false"
										class="lesson-nav-option"
										class:lesson-nav-option--vocab={entry.type === 'VOCABULARY'}
										class:lesson-nav-option--story={entry.type === 'STORY'}
									>
										<span class="lesson-nav-option-number">{entry.lessonOrder}.</span>
										<span class="lesson-nav-option-title">{entry.title}</span>
									</a>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</span>
			{#if nextLesson}
				<a
					href="/lessons/{nextLesson.id}"
					class="lesson-nav-icon"
					aria-label={`Next lesson: ${nextLesson.title}`}
					title={`Next lesson: ${nextLesson.title}`}
				>
					→
				</a>
			{/if}
		</div>
		{#if titleEditing}
			<input
				bind:this={titleInput}
				class="title-input"
				bind:value={titleDraft}
				onkeydown={handleTitleKeydown}
				onblur={() => void saveTitleEdit()}
				disabled={titleSaving}
				aria-label="Lesson title"
			/>
		{:else}
			<button type="button" class="title-button" onclick={startTitleEdit} title="Click to edit">
				<h1>{lessonTitle}</h1>
			</button>
		{/if}
		{#if titleError}
			<p class="error-text">{titleError}</p>
		{/if}
		{#if vocabularyTypeError}
			<p class="error-text">{vocabularyTypeError}</p>
		{/if}
	</div>
	<div class="lesson-head-actions">
		<form
			method="POST"
			action="?/deleteLesson"
			class="lesson-delete-form"
			onsubmit={onDeleteRequest}
		>
			<button type="submit" class="btn-sm danger">Delete lesson</button>
		</form>
	</div>
</div>

<style>
	.lesson-head-row {
		align-items: flex-start;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	.page-header-main {
		display: grid;
		gap: 0.2rem;
		min-width: 0;
	}

	.lesson-head-actions {
		align-items: flex-end;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.lesson-nav-icon {
		color: inherit;
		display: inline-block;
		padding: 0.5em 0.6em;
		margin: -0.5em 0;
		text-decoration: none;
	}
	.lesson-nav-icon:hover {
		color: var(--brand);
	}

	.lesson-delete-form {
		margin: 0;
	}

	.kicker {
		color: var(--accent);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.16em;
		margin-bottom: 6px;
		text-transform: uppercase;
	}

	h1 {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 2.5rem;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1.1;
		margin: 0;
	}

	.title-button {
		background: transparent;
		border: 0;
		cursor: text;
		display: inline-block;
		margin: 0;
		padding: 0;
		text-align: left;
	}

	.title-button h1 {
		border-bottom: 1px dashed transparent;
		margin: 0;
		transition: border-color 0.15s;
	}

	.title-button:hover h1,
	.title-button:focus-visible h1 {
		border-bottom-color: var(--line);
	}

	.title-input {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 2.5rem;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1.1;
		margin: 0;
		padding: 0.15rem 0.5rem;
		width: 100%;
	}

	.title-input:focus {
		border-color: var(--brand);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand) 18%, transparent);
		outline: none;
	}

	.vocab-type-select-wrap {
		display: inline-block;
		position: relative;
	}

	.vocab-type-trigger {
		align-items: baseline;
		background: transparent;
		border: 0;
		border-bottom: 1px dotted currentColor;
		color: inherit;
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		gap: 4px;
		letter-spacing: inherit;
		padding: 0 2px;
		text-transform: inherit;
	}

	.vocab-type-trigger:hover,
	.vocab-type-trigger:focus-visible {
		color: var(--brand);
		outline: none;
	}

	.vocab-type-menu {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 12px 28px -14px oklch(0.2 0.02 80 / 0.28);
		left: 0;
		list-style: none;
		margin: 6px 0 0;
		min-width: 100%;
		padding: 4px;
		position: absolute;
		top: 100%;
		z-index: 30;
	}

	.vocab-type-option {
		background: transparent;
		border: 0;
		border-radius: calc(var(--radius) - 2px);
		color: var(--ink);
		cursor: pointer;
		display: block;
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0;
		padding: 8px 12px;
		text-align: left;
		text-transform: none;
		white-space: nowrap;
		width: 100%;
	}

	.vocab-type-option:hover,
	.vocab-type-option:focus-visible {
		background: var(--surface);
		outline: none;
	}

	.vocab-type-option--selected {
		color: var(--brand);
	}

	.lesson-nav-select-wrap {
		display: inline-block;
		position: relative;
	}

	.lesson-nav-trigger {
		background: transparent;
		border: 0;
		border-bottom: 1px dotted currentColor;
		color: inherit;
		cursor: pointer;
		font: inherit;
		letter-spacing: inherit;
		padding: 0 2px;
		text-transform: inherit;
	}

	.lesson-nav-trigger:hover,
	.lesson-nav-trigger:focus-visible {
		color: var(--brand);
		outline: none;
	}

	.lesson-nav-menu {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 12px 28px -14px oklch(0.2 0.02 80 / 0.28);
		left: 0;
		list-style: none;
		margin: 6px 0 0;
		max-height: 60vh;
		min-width: 280px;
		overflow-y: auto;
		padding: 4px;
		position: absolute;
		top: 100%;
		z-index: 30;
	}

	.lesson-nav-option {
		align-items: baseline;
		background: transparent;
		border: 0;
		border-left: 3px solid transparent;
		border-radius: calc(var(--radius) - 2px);
		color: var(--ink);
		cursor: pointer;
		display: flex;
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 500;
		gap: 8px;
		letter-spacing: 0;
		padding: 8px 12px;
		text-align: left;
		text-decoration: none;
		text-transform: none;
		white-space: nowrap;
		width: 100%;
	}

	.lesson-nav-option:hover,
	.lesson-nav-option:focus-visible {
		background: var(--surface);
		outline: none;
	}

	.lesson-nav-option--vocab {
		border-left-color: var(--brand);
	}

	.lesson-nav-option--story {
		border-left-color: var(--accent);
	}

	.lesson-nav-option--current {
		color: var(--muted);
		cursor: default;
		opacity: 0.6;
	}

	.lesson-nav-option--current:hover {
		background: transparent;
	}

	.lesson-nav-option-number {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		min-width: 1.75em;
	}

	.lesson-nav-option--current .lesson-nav-option-number {
		color: inherit;
	}

	.lesson-nav-option-title {
		color: inherit;
	}

	.error-text {
		color: var(--danger);
		margin: 0;
	}

	@media (max-width: 800px) {
		.lesson-head-row {
			display: grid;
			grid-template-columns: 1fr;
		}
	}
</style>
