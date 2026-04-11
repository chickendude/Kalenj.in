<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatLessonType, formatVocabularyLessonType } from '$lib/course';
	import LessonFormFields from '$lib/components/LessonFormFields.svelte';

	let { data, form } = $props();
	type LessonFormValues = {
		title?: string;
		level?: string;
		type?: string;
		vocabularyType?: string;
		grammarMarkdown?: string;
		anchorLessonId?: string;
		position?: string;
	};
	let showAddLessonForm = $state(false);
	let createTitle = $state('');
	let createType = $state<'VOCABULARY' | 'STORY'>('VOCABULARY');
	let createVocabularyType = $state<'' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION'>('VOCAB');
	let createGrammarMarkdown = $state('');
	let adjacentLessonAnchorId = $state<string | null>(null);
	let adjacentLessonPosition = $state<'before' | 'after'>('after');
	let adjacentTitle = $state('');
	let adjacentType = $state<'VOCABULARY' | 'STORY'>('VOCABULARY');
	let adjacentVocabularyType = $state<'' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION'>('VOCAB');
	let adjacentGrammarMarkdown = $state('');
	const formValues = $derived((form?.values ?? {}) as LessonFormValues);

	$effect(() => {
		if (form?.error && !formValues.anchorLessonId) {
			showAddLessonForm = true;
		}
	});

	$effect(() => {
		if (formValues.anchorLessonId) {
			return;
		}

		createTitle = formValues.title ?? '';
		createType = normalizeCreateType(formValues.type);
		createVocabularyType = normalizeVocabularyType(formValues.vocabularyType) || 'VOCAB';
		createGrammarMarkdown = formValues.grammarMarkdown ?? '';
	});

	$effect(() => {
		if (formValues.anchorLessonId && (formValues.position === 'before' || formValues.position === 'after')) {
			adjacentLessonAnchorId = formValues.anchorLessonId;
			adjacentLessonPosition = formValues.position;
			adjacentTitle = formValues.title ?? '';
			adjacentType = normalizeCreateType(formValues.type);
			adjacentVocabularyType = normalizeVocabularyType(formValues.vocabularyType) || 'VOCAB';
			adjacentGrammarMarkdown = formValues.grammarMarkdown ?? '';
		}
	});

	async function navigateToLevel(level: string) {
		await goto(`/lessons?level=${level}`, {
			invalidateAll: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function normalizeCreateType(value: string | undefined): 'VOCABULARY' | 'STORY' {
		return value === 'STORY' ? 'STORY' : 'VOCABULARY';
	}

	function normalizeVocabularyType(value: string | undefined): '' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION' {
		if (value === 'GRAMMAR' || value === 'VOCAB' || value === 'EXPRESSION') {
			return value;
		}

		return '';
	}

	function openAdjacentLessonForm(anchorLessonId: string, position: 'before' | 'after') {
		adjacentLessonAnchorId = anchorLessonId;
		adjacentLessonPosition = position;
		adjacentTitle = '';
		adjacentType = 'VOCABULARY';
		adjacentVocabularyType = 'VOCAB';
		adjacentGrammarMarkdown = '';
		showAddLessonForm = false;
	}

	function closeAdjacentLessonForm() {
		adjacentLessonAnchorId = null;
	}

</script>

<section>
	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	<section class="level-section">
		<div class="section-header">
			<h2>Lesson path</h2>
		</div>

		<div class="level-summary-grid">
			{#each data.levelSummaries as summary}
				<a
					class:selected={summary.level === data.selectedLevel}
					class="level-summary-card"
					href={`/lessons?level=${summary.level}`}
					onclick={async (event) => {
						event.preventDefault();
						await navigateToLevel(summary.level);
					}}
				>
					<strong>{summary.level}</strong>
					<span>{summary.lessonCount} lesson(s)</span>
				</a>
			{/each}
		</div>

		<div class="level-actions">
			<button type="button" class="secondary-button" onclick={() => (showAddLessonForm = !showAddLessonForm)}>
				{showAddLessonForm ? 'Close Add Lesson' : `Add ${data.selectedLevel} Lesson`}
			</button>
		</div>

		{#if showAddLessonForm}
			<form method="POST" action="?/create" class="editor-form add-lesson-form">
				<input type="hidden" name="level" value={data.selectedLevel} />

				<p class="field-caption">Adding to {data.selectedLevel}</p>

				<p class="field-caption">Lesson order will default to {data.nextLessonOrder}.</p>

				<LessonFormFields
					bind:title={createTitle}
					bind:type={createType}
					bind:vocabularyType={createVocabularyType}
					bind:grammarMarkdown={createGrammarMarkdown}
					lessonTypes={data.lessonTypes}
					vocabularyTypes={data.vocabularyTypes}
					titlePlaceholder="Lesson title"
				/>

				<div class="form-actions">
					<button type="submit">Create lesson</button>
					<button type="button" class="secondary-button" onclick={() => (showAddLessonForm = false)}>
						Cancel
					</button>
				</div>
			</form>
		{/if}

		{#if data.selectedLevelLessons.length === 0}
			<p>No lessons yet in {data.selectedLevel}.</p>
		{:else}
			<ol class="lesson-path">
				{#each data.selectedLevelLessons as lesson}
					<li class:story-lesson={lesson.type === 'STORY'}>
						<a class="lesson-link" href={`/lessons/${lesson.id}`}>
							<span class="lesson-order">{lesson.lessonOrder}.</span>
							<span class="lesson-title">{lesson.title}</span>
						</a>
						<div class="lesson-meta">
							<span>
								{formatLessonType(lesson.type)}
								{#if lesson.vocabularyType}
									({formatVocabularyLessonType(lesson.vocabularyType)})
								{/if}
							</span>
							<span>{lesson._count.sections} section(s)</span>
						</div>
						<div class="inline-lesson-actions">
							<button
								type="button"
								class="mini-button"
								onclick={() => openAdjacentLessonForm(lesson.id, 'before')}
							>
								Add Before
							</button>
							<button
								type="button"
								class="mini-button"
								onclick={() => openAdjacentLessonForm(lesson.id, 'after')}
							>
								Add After
							</button>
						</div>

						{#if adjacentLessonAnchorId === lesson.id}
							<form method="POST" action="?/createAdjacent" class="inline-story-form">
								<input type="hidden" name="anchorLessonId" value={lesson.id} />
								<input type="hidden" name="position" value={adjacentLessonPosition} />

								<LessonFormFields
									bind:title={adjacentTitle}
									bind:type={adjacentType}
									bind:vocabularyType={adjacentVocabularyType}
									bind:grammarMarkdown={adjacentGrammarMarkdown}
									lessonTypes={data.lessonTypes}
									vocabularyTypes={data.vocabularyTypes}
									titlePlaceholder={`Lesson ${adjacentLessonPosition === 'before' ? 'before' : 'after'} ${lesson.title}`}
								/>

								<button type="submit">Create Lesson</button>
								<button type="button" class="secondary-button" onclick={closeAdjacentLessonForm}>
									Cancel
								</button>
							</form>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</section>

<style>
	.error {
		color: #8c1c13;
		font-weight: 600;
	}

	.editor-form {
		display: grid;
		gap: 0.75rem;
		max-width: 720px;
		margin-bottom: 2rem;
	}

	.field-caption {
		color: #555;
		margin: 0;
	}

	.level-section {
		margin-bottom: 2rem;
	}

	.section-header {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.level-summary-grid {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		margin-bottom: 1rem;
	}

	.level-actions {
		margin-bottom: 1rem;
	}

	.level-summary-card {
		border: 1px solid #e2e2e2;
		color: inherit;
		display: grid;
		gap: 0.2rem;
		padding: 0.85rem;
		text-decoration: none;
	}

	.level-summary-card.selected {
		border-color: #1d4ed8;
		background: #eff6ff;
	}

	.lesson-path {
		display: grid;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
	}

	.lesson-path li {
		border: 1px solid #e2e2e2;
		list-style: none;
		padding: 1rem;
	}

	.lesson-path li.story-lesson {
		border-color: #c08457;
		background: #fffaf5;
	}

	.lesson-link {
		color: inherit;
		display: flex;
		gap: 0.5rem;
		text-decoration: none;
	}

	.lesson-title {
		font-weight: 600;
	}

	.lesson-meta {
		color: #555;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.35rem;
	}

	.inline-lesson-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.inline-story-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.inline-story-form :global(label) {
		width: 100%;
	}

	.add-lesson-form {
		border: 1px solid #e2e2e2;
		padding: 1rem;
	}

	input,
	button {
		font: inherit;
		padding: 0.45rem 0.5rem;
	}

	.secondary-button {
		background: #fff;
		border: 1px solid #d0d0d0;
	}

	.mini-button {
		background: #fff;
		border: 1px solid #d0d0d0;
		font: inherit;
		padding: 0.3rem 0.55rem;
	}

	.form-actions {
		display: flex;
		gap: 0.75rem;
	}
</style>
