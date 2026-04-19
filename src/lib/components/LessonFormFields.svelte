<script lang="ts">
	import { formatLessonType, formatVocabularyLessonType } from '$lib/course';
	import { validateStoryImportText } from '$lib/story-import';

	let {
		title = $bindable(''),
		type = $bindable<'VOCABULARY' | 'STORY'>('VOCABULARY'),
		vocabularyType = $bindable<'' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION'>('VOCAB'),
		grammarMarkdown = $bindable(''),
		storyImportText = $bindable(''),
		showStoryImport = true,
		lessonTypes,
		vocabularyTypes,
		titlePlaceholder = 'Lesson title'
	}: {
		title?: string;
		type?: 'VOCABULARY' | 'STORY';
		vocabularyType?: '' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION';
		grammarMarkdown?: string;
		storyImportText?: string;
		showStoryImport?: boolean;
		lessonTypes: readonly ('VOCABULARY' | 'STORY')[];
		vocabularyTypes: readonly ('GRAMMAR' | 'VOCAB' | 'EXPRESSION')[];
		titlePlaceholder?: string;
	} = $props();

	const storyImportError = $derived(
		storyImportText ? validateStoryImportText(storyImportText) : null
	);
</script>

<div class="field">
	<label for="lesson-title">Title *</label>
	<input
		id="lesson-title"
		class="input"
		name="title"
		required
		bind:value={title}
		placeholder={titlePlaceholder}
	/>
</div>

<div class="type-row">
	<div class="field" role="group" aria-labelledby="lesson-type-label">
		<span id="lesson-type-label" class="field-legend">Type</span>
		<div class="seg">
			{#each lessonTypes as lessonType}
				<button
					type="button"
					class:active={type === lessonType}
					onclick={() => (type = lessonType)}
				>
					{formatLessonType(lessonType)}
				</button>
			{/each}
		</div>
		{#each lessonTypes as lessonType}
			<input type="radio" name="type" value={lessonType} checked={type === lessonType} hidden />
		{/each}
	</div>

	{#if type === 'VOCABULARY'}
		<div class="field" role="group" aria-labelledby="vocab-subtype-label">
			<span id="vocab-subtype-label" class="field-legend">Vocabulary subtype</span>
			<div class="seg">
				{#each vocabularyTypes as currentVocabularyType}
					<button
						type="button"
						class:active={vocabularyType === currentVocabularyType}
						onclick={() => (vocabularyType = currentVocabularyType)}
					>
						{formatVocabularyLessonType(currentVocabularyType)}
					</button>
				{/each}
			</div>
			{#each vocabularyTypes as currentVocabularyType}
				<input
					type="radio"
					name="vocabularyType"
					value={currentVocabularyType}
					checked={vocabularyType === currentVocabularyType}
					hidden
				/>
			{/each}
		</div>
	{/if}
</div>

{#if type === 'VOCABULARY'}
	<div class="field">
		<label for="lesson-grammar">Grammar notes (markdown, optional)</label>
		<textarea
			id="lesson-grammar"
			class="input"
			name="grammarMarkdown"
			rows="5"
			bind:value={grammarMarkdown}
			placeholder="Grammar markdown"
		></textarea>
	</div>
{:else if showStoryImport}
	<div class="field">
		<label for="lesson-story-import">Story text</label>
		<textarea
			id="lesson-story-import"
			class="input"
			name="storyImportText"
			rows="8"
			bind:value={storyImportText}
			placeholder="Paste story text here"
		></textarea>
	</div>
	<div class="story-import-feedback">
		{#if storyImportError}
			<p class="story-import-error">{storyImportError}</p>
		{:else if storyImportText}
			<p class="story-import-hint">Format looks good.</p>
		{:else}
			<p class="story-import-hint">
				One line per sentence. Separate parts with tab or " / ": Kalenjin / English, or
				Speaker: / Kalenjin / English.
			</p>
		{/if}
	</div>
{/if}

<style>
	.field-legend {
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-mute);
		font-weight: 600;
	}
	.type-row {
		display: flex;
		flex-wrap: wrap;
		gap: 18px;
		margin-top: 14px;
	}
	.type-row > .field {
		flex: 0 0 auto;
	}
	.field + .field {
		margin-top: 14px;
	}
	.type-row .field + .field {
		margin-top: 0;
	}
	.story-import-feedback {
		margin-top: 8px;
		min-height: 1.4rem;
	}
	.story-import-error {
		color: oklch(0.45 0.15 25);
		font-size: 13px;
		margin: 0;
		white-space: pre-line;
	}
	.story-import-hint {
		color: var(--ink-mute);
		font-size: 13px;
		margin: 0;
	}

</style>
