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
	let expandedUninstructed = $state(new Set<string>());

	function toggleUninstructed(lessonId: string) {
		const next = new Set(expandedUninstructed);
		if (next.has(lessonId)) {
			next.delete(lessonId);
		} else {
			next.add(lessonId);
		}
		expandedUninstructed = next;
	}
	let createTitle = $state('');
	let createType = $state<'VOCABULARY' | 'STORY'>('VOCABULARY');
	let createVocabularyType = $state<'' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION'>('VOCAB');
	let createGrammarMarkdown = $state('');
	let createStoryImportText = $state('');
	let adjacentLessonAnchorId = $state<string | null>(null);
	let adjacentLessonPosition = $state<'before' | 'after'>('after');
	let adjacentTitle = $state('');
	let adjacentType = $state<'VOCABULARY' | 'STORY'>('VOCABULARY');
	let adjacentVocabularyType = $state<'' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION'>('VOCAB');
	let adjacentGrammarMarkdown = $state('');
	let adjacentStoryImportText = $state('');
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
		createStoryImportText = '';
	});

	$effect(() => {
		if (formValues.anchorLessonId && (formValues.position === 'before' || formValues.position === 'after')) {
			adjacentLessonAnchorId = formValues.anchorLessonId;
			adjacentLessonPosition = formValues.position;
			adjacentTitle = formValues.title ?? '';
			adjacentType = normalizeCreateType(formValues.type);
			adjacentVocabularyType = normalizeVocabularyType(formValues.vocabularyType) || 'VOCAB';
			adjacentGrammarMarkdown = formValues.grammarMarkdown ?? '';
			adjacentStoryImportText = '';
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
		adjacentStoryImportText = '';
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
					bind:storyImportText={createStoryImportText}
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

						{#if lesson.type === 'STORY' && lesson.id in data.uninstructedWordsByLessonId}
							{@const uninstructed = data.uninstructedWordsByLessonId[lesson.id]}
							{#if uninstructed.length > 0}
								<div class="uninstructed-summary">
									<button
										type="button"
										class="uninstructed-toggle"
										aria-expanded={expandedUninstructed.has(lesson.id)}
										onclick={() => toggleUninstructed(lesson.id)}
									>
										{uninstructed.length} word{uninstructed.length === 1 ? '' : 's'} not yet introduced
										<span class="toggle-caret">{expandedUninstructed.has(lesson.id) ? '▲' : '▼'}</span>
									</button>

									{#if expandedUninstructed.has(lesson.id)}
										<ul class="uninstructed-list">
											{#each uninstructed as word}
												<li>
													<a href={`/dictionary/${word.id}`} class="uninstructed-word">
														<span class="word-kalenjin">{word.kalenjin}</span>
														<span class="word-translations">{word.translations}</span>
													</a>
												</li>
											{/each}
										</ul>
									{/if}
								</div>
							{:else}
								<p class="all-introduced">All story words introduced</p>
							{/if}
						{/if}

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
									bind:storyImportText={adjacentStoryImportText}
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
		list-style: none;
		padding: 0.1rem 0;
	}

	.lesson-path li.story-lesson {
		background: #fffaf5;
		padding-left: 0.5rem;
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

	.uninstructed-summary {
		margin-top: 0.5rem;
	}

	.uninstructed-toggle {
		background: none;
		border: none;
		color: #92400e;
		cursor: pointer;
		font: inherit;
		font-size: 0.875rem;
		padding: 0;
	}

	.uninstructed-toggle:hover {
		text-decoration: underline;
	}

	.toggle-caret {
		font-size: 0.7rem;
		margin-left: 0.3rem;
	}

	.uninstructed-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		list-style: none;
		margin: 0.4rem 0 0;
		padding: 0;
	}

	.uninstructed-word {
		background: #fff7ed;
		border: 1px solid #fed7aa;
		border-radius: 3px;
		color: inherit;
		display: flex;
		font-size: 0.85rem;
		gap: 0.3rem;
		padding: 0.2rem 0.45rem;
		text-decoration: none;
	}

	.uninstructed-word:hover {
		border-color: #c08457;
	}

	.word-kalenjin {
		font-weight: 600;
	}

	.word-translations {
		color: #555;
	}

	.all-introduced {
		color: #1a7f37;
		font-size: 0.875rem;
		margin: 0.5rem 0 0;
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
