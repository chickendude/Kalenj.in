<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatLessonType, formatVocabularyLessonType } from '$lib/course';
	import LessonFormFields from '$lib/components/LessonFormFields.svelte';
	import { stripWordLinks } from '$lib/word-links';

	let { data, form } = $props();
	type LessonFormValues = {
		title?: string;
		level?: string;
		type?: string;
		vocabularyType?: string;
		grammarMarkdown?: string;
		anchorLessonId?: string;
		position?: string;
		englishList?: string;
	};
	let showAddLessonForm = $state(false);
	let expandedUninstructed = $state(new Set<string>());
	let showCefrSidebar = $state(false);
	let showReplaceEditor = $state(false);
	let cefrSearchInput = $state('');
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	const totalLessonCount = $derived(
		data.levelSummaries.reduce((sum, s) => sum + s.lessonCount, 0)
	);

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
	const isCefrFormError = $derived(Boolean(form?.error) && formValues.englishList !== undefined);

	$effect(() => {
		if (form?.error && !formValues.anchorLessonId && !isCefrFormError) {
			showAddLessonForm = true;
		}
	});

	$effect(() => {
		if (isCefrFormError) {
			showCefrSidebar = true;
			showReplaceEditor = true;
		}
	});

	$effect(() => {
		cefrSearchInput = data.cefrQuery;
	});

	$effect(() => {
		const currentInput = cefrSearchInput;

		if (currentInput === data.cefrQuery) {
			return;
		}

		if (searchDebounceTimer !== null) {
			clearTimeout(searchDebounceTimer);
		}

		searchDebounceTimer = setTimeout(() => {
			searchDebounceTimer = null;
			navigateTo(
				buildLevelUrl(
					data.selectedLevel,
					currentInput,
					data.cefrSort,
					1,
					data.cefrCoverageFilter,
					data.cefrPosFilters
				)
			);
		}, 250);

		return () => {
			if (searchDebounceTimer !== null) {
				clearTimeout(searchDebounceTimer);
				searchDebounceTimer = null;
			}
		};
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

	function buildLevelUrl(
		level: string,
		query: string,
		sort: string,
		page = 1,
		coverage: 'all' | 'covered' | 'uncovered' = 'all',
		pos: string[] = []
	): string {
		const params = new URLSearchParams();
		params.set('level', level);

		if (query) {
			params.set('q', query);
		}

		if (sort !== 'alpha-asc') {
			params.set('sort', sort);
		}

		if (page > 1) {
			params.set('page', String(page));
		}

		if (coverage !== 'all') {
			params.set('covered', coverage === 'covered' ? 'yes' : 'no');
		}

		if (pos.length > 0) {
			params.set('pos', pos.join(','));
		}

		return `/lessons?${params.toString()}`;
	}

	async function navigateTo(url: string) {
		await goto(url, {
			invalidateAll: true,
			keepFocus: true,
			noScroll: true
		});
	}

	async function navigateToLevel(level: string) {
		await navigateTo(
			buildLevelUrl(
				level,
				data.cefrQuery,
				data.cefrSort,
				1,
				data.cefrCoverageFilter,
				data.cefrPosFilters
			)
		);
	}

	async function toggleCefrSort() {
		const nextSort = data.cefrSort === 'alpha-asc' ? 'alpha-desc' : 'alpha-asc';
		await navigateTo(
			buildLevelUrl(
				data.selectedLevel,
				data.cefrQuery,
				nextSort,
				1,
				data.cefrCoverageFilter,
				data.cefrPosFilters
			)
		);
	}

	async function setCoverageFilter(coverage: 'all' | 'covered' | 'uncovered') {
		await navigateTo(
			buildLevelUrl(
				data.selectedLevel,
				data.cefrQuery,
				data.cefrSort,
				1,
				coverage,
				data.cefrPosFilters
			)
		);
	}

	async function togglePosFilter(token: string) {
		const next = data.cefrPosFilters.includes(token) ? [] : [token];

		await navigateTo(
			buildLevelUrl(
				data.selectedLevel,
				data.cefrQuery,
				data.cefrSort,
				1,
				data.cefrCoverageFilter,
				next
			)
		);
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

<svelte:head>
	<title>Lessons — Kalenj.in</title>
</svelte:head>

<section>
	<div class="page-head">
		<div>
			<div class="page-kicker">Learning progression</div>
			<h1>Lessons</h1>
			<p>
				Lessons are organised by CEFR level. Stories introduce words in context; vocabulary
				lessons teach words in focused sets.
			</p>
		</div>
		<div class="page-stat">
			<b>{totalLessonCount}</b>
			lessons total
		</div>
	</div>

	{#if form?.error}
		<p class="error-banner">{form.error}</p>
	{/if}

	<div class="level-tabs">
		{#each data.levelSummaries as summary}
			<button
				type="button"
				class="level-tab"
				class:active={summary.level === data.selectedLevel}
				aria-pressed={summary.level === data.selectedLevel}
				onclick={() => navigateToLevel(summary.level)}
			>
				<b>{summary.level}</b>
				<span>{summary.lessonCount} lesson{summary.lessonCount === 1 ? '' : 's'}</span>
				<span class="level-tab-cefr">
					{summary.cefrCoveredCount}/{summary.cefrTotalCount} CEFR
				</span>
			</button>
		{/each}
	</div>

	<div class="level-actions">
		<button
			type="button"
			class="btn ghost"
			onclick={() => (showAddLessonForm = !showAddLessonForm)}
		>
			{showAddLessonForm ? 'Close' : `Add ${data.selectedLevel} lesson`}
		</button>
		<button
			type="button"
			class="btn ghost"
			aria-pressed={showCefrSidebar}
			onclick={() => (showCefrSidebar = !showCefrSidebar)}
		>
			{showCefrSidebar ? 'Hide CEFR targets' : 'Show CEFR targets'}
		</button>
	</div>

	<div class="lessons-layout" class:with-sidebar={showCefrSidebar}>
		<div class="lessons-main">
			{#if showAddLessonForm}
				<form method="POST" action="?/create" class="side-card add-lesson">
					<div class="add-lesson-head">
						<h3>Adding to {data.selectedLevel}</h3>
						<span class="add-lesson-order">order will default to {data.nextLessonOrder}</span>
					</div>

					<input type="hidden" name="level" value={data.selectedLevel} />

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
						<button type="submit" class="btn">Create lesson</button>
						<button type="button" class="btn ghost" onclick={() => (showAddLessonForm = false)}>
							Cancel
						</button>
					</div>
				</form>
			{/if}

			{#snippet adjacentSlot(lesson: (typeof data.selectedLevelLessons)[number])}
				<li class="lesson-card add-lesson-slot">
					<form method="POST" action="?/createAdjacent" class="add-lesson-form">
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

						<div class="form-actions">
							<button type="submit" class="btn">Create lesson</button>
							<button type="button" class="btn ghost" onclick={closeAdjacentLessonForm}>
								Cancel
							</button>
						</div>
					</form>
				</li>
			{/snippet}

			{#if data.selectedLevelLessons.length === 0}
				<div class="empty">
					No lessons at {data.selectedLevel} yet. Click "Add {data.selectedLevel} lesson".
				</div>
			{:else}
				<ol class="lesson-list">
					{#each data.selectedLevelLessons as lesson, i}
						{@const uninstructed = data.uninstructedWordsByLessonId[lesson.id] ?? []}
						{@const hasCoverage = lesson.type === 'STORY' && lesson.id in data.uninstructedWordsByLessonId}

						{#if adjacentLessonAnchorId === lesson.id && adjacentLessonPosition === 'before'}
							{@render adjacentSlot(lesson)}
						{/if}

						<li class="lesson-card" class:is-story={lesson.type === 'STORY'}>
							<div class="lesson-card-head">
								<div class="lesson-num">{String(i + 1).padStart(2, '0')}</div>
								<div class="lesson-card-body">
									<a class="lesson-card-title" href={`/lessons/${lesson.id}`}>{lesson.title}</a>
									<div class="lesson-card-meta">
										<span class="type-pill {lesson.type === 'STORY' ? 'story' : 'vocab'}">
											{#if lesson.type === 'STORY'}
												Story
											{:else}
												Vocabulary · {lesson.vocabularyType
													? formatVocabularyLessonType(lesson.vocabularyType)
													: '—'}
											{/if}
										</span>
										{#if lesson.type === 'VOCABULARY'}
											<span class="meta-dim">
												{lesson._count.sections} section{lesson._count.sections === 1 ? '' : 's'}
											</span>
										{:else if hasCoverage}
											{#if uninstructed.length === 0}
												<span class="coverage ok">All story words introduced</span>
											{:else}
												<button
													type="button"
													class="coverage warn coverage-toggle"
													aria-expanded={expandedUninstructed.has(lesson.id)}
													onclick={() => toggleUninstructed(lesson.id)}
												>
													{uninstructed.length} word{uninstructed.length === 1 ? '' : 's'} not yet introduced
													<span class="caret">{expandedUninstructed.has(lesson.id) ? '▲' : '▼'}</span>
												</button>
											{/if}
										{/if}
									</div>
								</div>
								<a class="btn ghost" href={`/lessons/${lesson.id}`}>Open</a>
							</div>

							{#if hasCoverage && uninstructed.length > 0 && expandedUninstructed.has(lesson.id)}
								<div class="uninstructed-panel">
									<ul class="uninstructed-list">
										{#each uninstructed as word}
											<li>
												<a href={`/dictionary/${word.id}`} class="uninstructed-word">
													<span class="kal">{word.kalenjin}</span>
													<span class="en">{stripWordLinks(word.translations)}</span>
												</a>
											</li>
										{/each}
									</ul>
								</div>
							{/if}

							<div class="lesson-card-actions">
								<button
									type="button"
									class="btn ghost sm"
									onclick={() => openAdjacentLessonForm(lesson.id, 'before')}
								>
									Add before
								</button>
								<button
									type="button"
									class="btn ghost sm"
									onclick={() => openAdjacentLessonForm(lesson.id, 'after')}
								>
									Add after
								</button>
							</div>
						</li>

						{#if adjacentLessonAnchorId === lesson.id && adjacentLessonPosition === 'after'}
							{@render adjacentSlot(lesson)}
						{/if}
					{/each}
				</ol>
			{/if}
		</div>

		{#if showCefrSidebar}
			{@const selectedLevelSummary = data.levelSummaries.find(
				(s) => s.level === data.selectedLevel
			)}
			<aside class="side-card cefr-sidebar" aria-label="CEFR targets">
				<div class="cefr-sidebar-head">
					<div class="cefr-sidebar-title">
						<h3>{data.selectedLevel} CEFR targets</h3>
						<p class="cefr-sidebar-summary">
							{selectedLevelSummary?.cefrTotalCount ?? 0} total ·
							{selectedLevelSummary?.cefrCoveredCount ?? 0} covered
						</p>
					</div>
					<button
						type="button"
						class="btn-sm ghost"
						onclick={() => (showReplaceEditor = !showReplaceEditor)}
					>
						{showReplaceEditor ? 'Close' : 'Replace list'}
					</button>
				</div>

				{#if showReplaceEditor}
					<form method="POST" action="?/replaceCefrTargets" class="cefr-replace-form">
						<input type="hidden" name="level" value={data.selectedLevel} />
						<input type="hidden" name="returnQuery" value={data.cefrQuery} />
						<input type="hidden" name="returnSort" value={data.cefrSort} />

						<div class="side-field">
							<label for="cefr-english-list">English references</label>
							<textarea
								id="cefr-english-list"
								class="side-textarea"
								name="englishList"
								rows="8"
								required
								placeholder="hello&#10;good morning&#10;to search"
							>{formValues.englishList ?? ''}</textarea>
							<small class="muted">
								One word or phrase per line. Saving replaces the entire {data.selectedLevel} list.
							</small>
						</div>

						<div class="cefr-replace-actions">
							<button type="submit" class="btn-sm">Replace targets</button>
							<button
								type="button"
								class="btn-sm ghost"
								onclick={() => (showReplaceEditor = false)}
							>
								Cancel
							</button>
						</div>
					</form>
				{/if}

				<div class="side-field">
					<label for="cefr-search-input">Search</label>
					<div class="cefr-search-row">
						<input
							id="cefr-search-input"
							class="side-input"
							type="text"
							bind:value={cefrSearchInput}
							placeholder={`Filter ${data.selectedLevel}`}
							aria-label={`Search ${data.selectedLevel} targets`}
						/>
						<button
							type="button"
							class="cefr-chip sort-chip"
							onclick={toggleCefrSort}
							aria-label="Toggle sort order"
						>
							{data.cefrSort === 'alpha-asc' ? 'A–Z' : 'Z–A'}
						</button>
					</div>
				</div>

				<div class="side-field">
					<span class="cefr-filter-label">Coverage</span>
					<div class="cefr-chip-row">
						<button
							type="button"
							class="cefr-chip"
							class:active={data.cefrCoverageFilter === 'all'}
							aria-pressed={data.cefrCoverageFilter === 'all'}
							onclick={() => setCoverageFilter('all')}
						>
							All
						</button>
						<button
							type="button"
							class="cefr-chip"
							class:active={data.cefrCoverageFilter === 'covered'}
							aria-pressed={data.cefrCoverageFilter === 'covered'}
							onclick={() => setCoverageFilter('covered')}
						>
							Covered
						</button>
						<button
							type="button"
							class="cefr-chip"
							class:active={data.cefrCoverageFilter === 'uncovered'}
							aria-pressed={data.cefrCoverageFilter === 'uncovered'}
							onclick={() => setCoverageFilter('uncovered')}
						>
							Uncovered
						</button>
					</div>
				</div>

				<div class="side-field">
					<span class="cefr-filter-label">Part of speech</span>
					<div class="cefr-chip-row">
						{#each data.cefrPosOptions as option}
							<button
								type="button"
								class="cefr-chip"
								class:active={data.cefrPosFilters.includes(option.token)}
								aria-pressed={data.cefrPosFilters.includes(option.token)}
								onclick={() => togglePosFilter(option.token)}
							>
								{option.token}
								<span class="cefr-chip-count">{option.count}</span>
							</button>
						{/each}
					</div>
				</div>

				<p class="cefr-results-summary">
					Showing {data.cefrTargets.length} of {data.cefrFilteredCount}
					{#if data.cefrQuery}
						for “{data.cefrQuery}”
					{/if}
				</p>

				{#if data.cefrTargets.length === 0}
					<p class="cefr-empty">No targets found.</p>
				{:else}
					<ul class="cefr-target-list">
						{#each data.cefrTargets as target}
							{@const covered = target.coveredByLessonWord}
							<li class="cefr-target" class:covered={covered}>
								<span class="cefr-target-english">{target.english}</span>
								{#if covered}
									<span class="cefr-target-coverage">
										{covered.lessonSection.lesson.level}.{covered.lessonSection.lesson.lessonOrder}
										· section {covered.lessonSection.sectionOrder}:
										<em>{covered.kalenjin}</em>
									</span>
								{/if}
							</li>
						{/each}
					</ul>

					{#if data.cefrTotalPages > 1}
						<nav class="cefr-pagination">
							{#if data.cefrPage > 1}
								<a
									href={buildLevelUrl(
										data.selectedLevel,
										data.cefrQuery,
										data.cefrSort,
										data.cefrPage - 1,
										data.cefrCoverageFilter,
										data.cefrPosFilters
									)}
									onclick={async (event) => {
										event.preventDefault();
										await navigateTo(
											buildLevelUrl(
												data.selectedLevel,
												data.cefrQuery,
												data.cefrSort,
												data.cefrPage - 1,
												data.cefrCoverageFilter,
												data.cefrPosFilters
											)
										);
									}}
								>
									Previous
								</a>
							{:else}
								<span class="disabled">Previous</span>
							{/if}

							<span>Page {data.cefrPage} of {data.cefrTotalPages}</span>

							{#if data.cefrPage < data.cefrTotalPages}
								<a
									href={buildLevelUrl(
										data.selectedLevel,
										data.cefrQuery,
										data.cefrSort,
										data.cefrPage + 1,
										data.cefrCoverageFilter,
										data.cefrPosFilters
									)}
									onclick={async (event) => {
										event.preventDefault();
										await navigateTo(
											buildLevelUrl(
												data.selectedLevel,
												data.cefrQuery,
												data.cefrSort,
												data.cefrPage + 1,
												data.cefrCoverageFilter,
												data.cefrPosFilters
											)
										);
									}}
								>
									Next
								</a>
							{:else}
								<span class="disabled">Next</span>
							{/if}
						</nav>
					{/if}
				{/if}
			</aside>
		{/if}
	</div>
</section>

<style>
	.level-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0 0 20px;
	}

	.level-tab-cefr {
		color: var(--ink-soft);
		font-size: 0.8rem;
	}

	.lessons-layout {
		display: grid;
		gap: 1.5rem;
		grid-template-columns: minmax(0, 1fr);
	}

	.lessons-layout.with-sidebar {
		grid-template-columns: minmax(0, 1fr);
	}

	@media (min-width: 1100px) {
		.lessons-layout.with-sidebar {
			grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
		}
	}

	.lessons-main {
		min-width: 0;
	}

	.cefr-sidebar {
		align-content: start;
	}

	.cefr-sidebar-head {
		align-items: flex-start;
		display: flex;
		gap: 12px;
		justify-content: space-between;
		margin-bottom: 16px;
	}

	.cefr-sidebar-title h3 {
		margin: 0 0 4px;
	}

	.cefr-sidebar-summary {
		color: var(--ink-soft);
		font-size: 12px;
		margin: 0;
	}

	.cefr-filter-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.cefr-search-row {
		align-items: stretch;
		display: flex;
		gap: 6px;
	}

	.cefr-search-row .side-input {
		flex: 1;
		min-width: 0;
	}

	.cefr-search-row .sort-chip {
		flex: 0 0 auto;
	}

	.cefr-chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.cefr-chip {
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--ink-soft);
		cursor: pointer;
		font-size: 12px;
		padding: 5px 10px;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}

	.cefr-chip:hover {
		border-color: var(--brand);
		color: var(--ink);
	}

	.cefr-chip.active {
		background: var(--brand);
		border-color: var(--brand);
		color: var(--on-brand);
	}

	.cefr-chip-count {
		color: inherit;
		font-size: 11px;
		margin-left: 4px;
		opacity: 0.7;
	}

	.sort-chip {
		font-variant-numeric: tabular-nums;
	}

	.cefr-replace-form {
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		margin-bottom: 16px;
		padding: 12px;
	}

	.cefr-replace-actions {
		display: flex;
		gap: 8px;
	}

	.cefr-results-summary {
		color: var(--ink-soft);
		font-size: 12px;
		margin: 0 0 10px;
	}

	.cefr-empty {
		color: var(--ink-soft);
		margin: 0;
	}

	.cefr-target-list {
		display: grid;
		gap: 4px;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.cefr-target {
		align-items: baseline;
		color: var(--ink);
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 4px 0;
	}

	.cefr-target.covered {
		color: var(--ink-mute);
	}

	.cefr-target-english {
		font-weight: 500;
	}

	.cefr-target-coverage {
		color: var(--ink-mute);
		font-size: 12px;
	}

	.cefr-pagination {
		align-items: center;
		display: flex;
		gap: 0.75rem;
		margin-top: 14px;
	}

	.cefr-pagination .disabled {
		color: var(--ink-mute);
	}
</style>
