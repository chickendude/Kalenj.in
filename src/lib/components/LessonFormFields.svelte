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

<label>
	Title *
	<input name="title" required bind:value={title} placeholder={titlePlaceholder} />
</label>

<div class="choice-row">
	<fieldset class="choice-group type-group">
		<legend>Type</legend>
		<div class="choice-options type-options">
			{#each lessonTypes as lessonType}
				<label class:selected={type === lessonType} class="choice-card type-card">
					<input type="radio" name="type" value={lessonType} bind:group={type} />
					<span>{formatLessonType(lessonType)}</span>
				</label>
			{/each}
		</div>
	</fieldset>

	{#if type === 'VOCABULARY'}
		<fieldset class="choice-group vocabulary-type-group">
			<legend>Vocabulary type</legend>
			<div class="choice-options vocabulary-type-options">
				{#each vocabularyTypes as currentVocabularyType}
					<label class:selected={vocabularyType === currentVocabularyType} class="choice-card vocabulary-type-card">
						<input
							type="radio"
							name="vocabularyType"
							value={currentVocabularyType}
							bind:group={vocabularyType}
						/>
						<span>{formatVocabularyLessonType(currentVocabularyType)}</span>
					</label>
				{/each}
			</div>
		</fieldset>
	{/if}
</div>

{#if type === 'VOCABULARY'}
	<label>
		Grammar markdown
		<textarea
			name="grammarMarkdown"
			rows="5"
			bind:value={grammarMarkdown}
			placeholder="Grammar markdown"
		></textarea>
	</label>
{:else if showStoryImport}
	<label>
		Story text
		<textarea
			name="storyImportText"
			rows="8"
			bind:value={storyImportText}
			placeholder="Paste story text here"
		></textarea>
	</label>
	<div class="story-import-feedback">
		{#if storyImportError}
			<p class="story-import-error">{storyImportError}</p>
		{:else if storyImportText}
			<p class="story-import-hint">Format looks good.</p>
		{:else}
			<p class="story-import-hint">One line per sentence. Separate parts with tab or " / ": Kalenjin / English, or Speaker: / Kalenjin / English.</p>
		{/if}
	</div>
{/if}

<style>
	label {
		display: grid;
		gap: 0.25rem;
	}

	.choice-row {
		display: grid;
		gap: 0.75rem;
	}

	.choice-group {
		border: 0;
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		width: fit-content;
	}

	.type-group {
		padding-right: 0.8rem;
	}

	.vocabulary-type-group {
		padding-left: 0.2rem;
	}

	.choice-group legend {
		font-weight: 600;
		margin-bottom: 0.25rem;
		padding: 0;
	}

	.choice-options {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.45rem;
		overflow-x: auto;
	}

	.choice-card {
		align-items: center;
		border: 1px solid #d0d7de;
		cursor: pointer;
		display: flex;
		gap: 0.35rem;
		padding: 0.6rem 0.65rem;
		white-space: nowrap;
		width: fit-content;
	}

	.choice-card input {
		display: none;
	}

	.choice-card.selected {
		background: #eff6ff;
		border-color: #2563eb;
	}

	.type-card {
		justify-content: center;
		min-width: 6.75rem;
	}

	.vocabulary-type-card {
		justify-content: center;
		min-width: 7.25rem;
	}

	.story-import-feedback {
		min-height: 1.6rem;
	}

	.story-import-error {
		color: #8c1c13;
		margin: 0;
		white-space: pre-line;
	}

	.story-import-hint {
		color: #555;
		margin: 0;
	}

	.field-caption {
		color: #555;
		margin: 0;
	}

	@media (min-width: 700px) {
		.choice-row {
			align-items: start;
			grid-template-columns: repeat(2, max-content);
		}
	}
</style>
