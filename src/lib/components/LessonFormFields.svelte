<script lang="ts">
	import { formatLessonType, formatVocabularyLessonType } from '$lib/course';

	let {
		title = $bindable(''),
		type = $bindable<'VOCABULARY' | 'STORY'>('VOCABULARY'),
		vocabularyType = $bindable<'' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION'>('VOCAB'),
		grammarMarkdown = $bindable(''),
		lessonTypes,
		vocabularyTypes,
		titlePlaceholder = 'Lesson title'
	}: {
		title?: string;
		type?: 'VOCABULARY' | 'STORY';
		vocabularyType?: '' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION';
		grammarMarkdown?: string;
		lessonTypes: readonly ('VOCABULARY' | 'STORY')[];
		vocabularyTypes: readonly ('GRAMMAR' | 'VOCAB' | 'EXPRESSION')[];
		titlePlaceholder?: string;
	} = $props();

	function contentFieldLabel(currentType: 'VOCABULARY' | 'STORY') {
		return currentType === 'STORY' ? 'Story text' : 'Grammar markdown';
	}

	function contentFieldHint(currentType: 'VOCABULARY' | 'STORY') {
		return currentType === 'STORY'
			? 'Use one line per sentence: Speaker: <tab> Kalenjin <tab> English.'
			: null;
	}
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

<label>
	{contentFieldLabel(type)}
	<textarea
		name="grammarMarkdown"
		rows={type === 'STORY' ? 8 : 5}
		bind:value={grammarMarkdown}
		placeholder={contentFieldLabel(type)}
	></textarea>
</label>

{#if contentFieldHint(type)}
	<p class="field-caption">{contentFieldHint(type)}</p>
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
