<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { formatLessonType, formatVocabularyLessonType } from '$lib/course';
	import CefrBrowseSidebar from '$lib/components/CefrBrowseSidebar.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import LessonFormFields from '$lib/components/LessonFormFields.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { stripWordLinks } from '$lib/word-links';
	import { dictionaryEntryHref } from '$lib/word-url';

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

	let visibilitySaving = $state(new Set<string>());

	async function toggleVisibility(lesson: { id: string; status: 'DRAFT' | 'PUBLISHED' }) {
		if (visibilitySaving.has(lesson.id)) return;
		visibilitySaving = new Set([...visibilitySaving, lesson.id]);
		const next = lesson.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
		try {
			const response = await fetch(`/lessons/${lesson.id}/lesson-inline`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ field: 'status', value: next })
			});
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(payload?.message ?? 'Could not change visibility.');
			}
			await invalidateAll();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Could not change visibility.', 4000);
		} finally {
			const remaining = new Set(visibilitySaving);
			remaining.delete(lesson.id);
			visibilitySaving = remaining;
		}
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

	type BuildUrlChanges = {
		level?: string;
		query?: string;
		sort?: 'alpha-asc' | 'alpha-desc';
		page?: number;
		coverage?: 'all' | 'covered' | 'uncovered';
		pos?: string[];
		random?: number | null;
	};

	function buildLessonsUrl(changes: BuildUrlChanges = {}): string {
		const params = new URLSearchParams();
		const level = changes.level ?? data.selectedLevel;
		const query = changes.query ?? data.cefrBrowse.query;
		const sort = changes.sort ?? data.cefrBrowse.sort;
		const page = changes.page ?? data.cefrBrowse.page;
		const coverage = changes.coverage ?? data.cefrBrowse.coverageFilter;
		const pos = changes.pos ?? data.cefrBrowse.posFilters;

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

		if (coverage === 'covered') {
			params.set('covered', 'yes');
		} else if (coverage === 'all') {
			params.set('covered', 'all');
		}

		if (pos.length > 0) {
			params.set('pos', pos.join(','));
		}

		if (changes.random) {
			params.set('random', String(changes.random));
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
		await navigateTo(buildLessonsUrl({ level, page: 1 }));
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

					<FormActions
						submitLabel="Create lesson"
						onCancel={() => (showAddLessonForm = false)}
					/>
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

						<FormActions submitLabel="Create lesson" onCancel={closeAdjacentLessonForm} />
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
								<Tooltip
									label={lesson.status === 'PUBLISHED'
										? 'Visible to learners — click to unpublish'
										: 'Hidden from learners — click to publish'}
								>
									<button
										type="button"
										class="visibility-btn"
										class:published={lesson.status === 'PUBLISHED'}
										aria-label={lesson.status === 'PUBLISHED'
											? `Unpublish ${lesson.title}`
											: `Publish ${lesson.title}`}
										disabled={visibilitySaving.has(lesson.id)}
										onclick={() => void toggleVisibility(lesson)}
									>
										{#if lesson.status === 'PUBLISHED'}
											<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path
													d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
													stroke="currentColor"
													stroke-width="1.6"
												/>
												<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6" />
											</svg>
										{:else}
											<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path
													d="M4 4l16 16M9.9 6.1A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 3.9M6 8a16.5 16.5 0 0 0-3.5 4S6 18.5 12 18.5c1 0 2-.2 2.8-.5M10 10.3a3 3 0 0 0 3.9 3.9"
													stroke="currentColor"
													stroke-width="1.6"
													stroke-linecap="round"
												/>
											</svg>
										{/if}
									</button>
								</Tooltip>
								<a class="btn ghost" href={`/lessons/${lesson.id}`}>Open</a>
							</div>

							{#if hasCoverage && uninstructed.length > 0 && expandedUninstructed.has(lesson.id)}
								<div class="uninstructed-panel">
									<ul class="uninstructed-list">
										{#each uninstructed as word}
											<li>
												<a href={dictionaryEntryHref(word)} class="uninstructed-word">
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
			<CefrBrowseSidebar
				level={data.selectedLevel}
				query={data.cefrBrowse.query}
				sort={data.cefrBrowse.sort}
				coverageFilter={data.cefrBrowse.coverageFilter}
				posFilters={data.cefrBrowse.posFilters}
				posOptions={data.cefrBrowse.posOptions}
				targets={data.cefrBrowse.targets}
				page={data.cefrBrowse.page}
				totalPages={data.cefrBrowse.totalPages}
				filteredCount={data.cefrBrowse.filteredCount}
				totalCount={selectedLevelSummary?.cefrTotalCount ?? data.cefrBrowse.totalCount}
				coveredCount={selectedLevelSummary?.cefrCoveredCount ?? data.cefrBrowse.coveredCount}
				isRandom={data.cefrBrowse.isRandom}
				buildUrl={buildLessonsUrl}
				replaceAction="?/replaceCefrTargets"
				replaceEnglishList={formValues.englishList ?? ''}
				initialShowReplaceEditor={isCefrFormError}
			/>
		{/if}
	</div>
</section>

<style>
	.visibility-btn {
		align-items: center;
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 50%;
		color: var(--ink-mute);
		cursor: pointer;
		display: inline-flex;
		flex-shrink: 0;
		height: 36px;
		justify-content: center;
		transition: color 0.15s, border-color 0.15s;
		width: 36px;
	}

	.visibility-btn.published {
		border-color: color-mix(in oklab, var(--brand) 55%, var(--line));
		color: var(--brand);
	}

	.visibility-btn:hover:not(:disabled) {
		border-color: var(--brand);
		color: var(--brand);
	}

	.visibility-btn:disabled {
		cursor: default;
		opacity: 0.5;
	}

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
</style>
