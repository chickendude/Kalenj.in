<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import CefrBrowseSidebar from '$lib/components/CefrBrowseSidebar.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import GrammarNotes from '$lib/components/GrammarNotes.svelte';
	import LessonAddWordForm from '$lib/components/LessonAddWordForm.svelte';
	import LessonHeader from '$lib/components/LessonHeader.svelte';
	import LessonStorySection from '$lib/components/LessonStorySection.svelte';
	import LessonWordCefrRow from '$lib/components/LessonWordCefrRow.svelte';
	import SentenceTokenAnnotations from '$lib/components/SentenceTokenAnnotations.svelte';
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';
	import WordCoveragePanel from '$lib/components/WordCoveragePanel.svelte';
	import type { PartOfSpeech } from '@prisma/client';
	import { splitLessonItemsIntoSections } from '$lib/course';
	import { isUnsetSentenceEnglish } from '$lib/sentence-placeholders';
	import { stripWordLinks } from '$lib/word-links';

	let { data, form } = $props();

	type CefrUrlChanges = {
		query?: string;
		sort?: 'alpha-asc' | 'alpha-desc';
		page?: number;
		coverage?: 'all' | 'covered' | 'uncovered';
		pos?: string[];
		random?: number | null;
	};

	function buildLessonCefrUrl(changes: CefrUrlChanges = {}): string {
		const params = new URLSearchParams();
		const query = changes.query ?? data.cefrBrowse.query;
		const sort = changes.sort ?? data.cefrBrowse.sort;
		const page = changes.page ?? data.cefrBrowse.page;
		const coverage = changes.coverage ?? data.cefrBrowse.coverageFilter;
		const pos = changes.pos ?? data.cefrBrowse.posFilters;

		if (query) params.set('q', query);
		if (sort !== 'alpha-asc') params.set('sort', sort);
		if (page > 1) params.set('page', String(page));
		if (coverage === 'covered') params.set('covered', 'yes');
		else if (coverage === 'all') params.set('covered', 'all');
		if (pos.length > 0) params.set('pos', pos.join(','));
		if (changes.random) params.set('random', String(changes.random));

		const qs = params.toString();
		return qs ? `/lessons/${data.lesson.id}?${qs}` : `/lessons/${data.lesson.id}`;
	}

	type LessonType = 'VOCABULARY' | 'STORY';
	type VocabularyType = '' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION';

	let showAddWordForm = $state(false);
	let vocabPanelsOpen = $state(false);

	let exampleFocusRequests = $state<
		Record<string, { position: 'first' | 'last'; nonce: number }>
	>({});
	let exampleFocusNonce = 0;

	function focusExampleSentence(targetSentenceId: string, position: 'first' | 'last') {
		exampleFocusNonce += 1;
		exampleFocusRequests = {
			...exampleFocusRequests,
			[targetSentenceId]: {
				position,
				nonce: exampleFocusNonce
			}
		};
	}

	function findAdjacentLessonWordWithSentence(
		currentLessonWordId: string,
		direction: 'prev' | 'next'
	) {
		const index = orderedLessonWords.findIndex((word) => word.id === currentLessonWordId);
		if (index < 0) {
			return null;
		}
		const step = direction === 'next' ? 1 : -1;
		for (let i = index + step; i >= 0 && i < orderedLessonWords.length; i += step) {
			const candidate = orderedLessonWords[i];
			if (candidate.sentence) {
				return candidate;
			}
		}
		return null;
	}

	type InlineLessonWordField = 'sentenceKalenjin' | 'sentenceEnglish' | 'notesMarkdown';
	type LessonWordLocalState = {
		sentenceKalenjin: string;
		sentenceEnglish: string;
		notesMarkdown: string;
	};
	let inlineLessonWordEdit = $state<{ lessonWordId: string; field: InlineLessonWordField } | null>(null);
	let inlineLessonWordValue = $state('');
	let inlineLessonWordError = $state<string | null>(null);
	let inlineLessonWordInput = $state<HTMLTextAreaElement | null>(null);
	let lessonWordLocalState = $state(new Map<string, LessonWordLocalState>());

	type InlineWordField = 'kalenjin' | 'translations';
	type WordLocalState = { kalenjin: string; translations: string };
	let inlineWordEdit = $state<{ lessonWordId: string; field: InlineWordField } | null>(null);
	let inlineWordValue = $state('');
	let inlineWordError = $state<string | null>(null);
	let inlineWordInput = $state<HTMLInputElement | null>(null);
	let wordLocalState = $state(new Map<string, WordLocalState>());
	let lessonWordOrder = $state<string[]>([]);
	let lessonWordOrderSignature = $state('');
	let draggedLessonWordId = $state<string | null>(null);
	let dropTargetLessonWordId = $state<string | null>(null);
	let reorderWordsForm = $state<HTMLFormElement | null>(null);
	let reorderWordsError = $state<string | null>(null);

	type PendingDelete =
		| { kind: 'word'; form: HTMLFormElement; wordLabel: string }
		| { kind: 'lesson'; form: HTMLFormElement };
	let pendingDelete = $state<PendingDelete | null>(null);

	let lessonTitle = $state('');
	let lessonType = $state<LessonType>('VOCABULARY');
	let lessonVocabularyType = $state<VocabularyType>('VOCAB');
	let lessonGrammarMarkdown = $state('');

	type EnhancedSubmitResult = ActionResult<Record<string, unknown> | undefined, Record<string, unknown> | undefined>;
	type EnhancedUpdate = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;

	const replaceSentenceLabel = 'Replace sentence text';
	const missingSentenceTranslationLabel = 'Add translation';

	const flattenedLessonWords = $derived(
		data.lesson.sections
			.flatMap((section) =>
				section.words.map((word) => ({
					...word,
					sectionOrder: section.sectionOrder
				}))
			)
			.sort((a, b) => {
				if (a.sectionOrder !== b.sectionOrder) {
					return a.sectionOrder - b.sectionOrder;
				}

				return a.itemOrder - b.itemOrder;
			})
	);
	const orderedLessonWords = $derived(orderLessonWords(flattenedLessonWords, lessonWordOrder));
	const displaySections = $derived(splitLessonItemsIntoSections(orderedLessonWords));

	$effect(() => {
		lessonTitle = data.lesson.title;
		lessonType = data.lesson.type;
		lessonVocabularyType = data.lesson.vocabularyType ?? 'VOCAB';
		lessonGrammarMarkdown = data.lesson.grammarMarkdown ?? '';
	});

	$effect(() => {
		const nextSignature = flattenedLessonWords.map((word) => word.id).join('|');
		if (nextSignature !== lessonWordOrderSignature) {
			lessonWordOrder = flattenedLessonWords.map((word) => word.id);
			lessonWordOrderSignature = nextSignature;
		}
	});

	$effect(() => {
		if (!inlineLessonWordEdit) return;
		const timeout = window.setTimeout(() => {
			inlineLessonWordInput?.focus();
			inlineLessonWordInput?.select();
		}, 0);
		return () => window.clearTimeout(timeout);
	});

	$effect(() => {
		if (!inlineWordEdit) return;
		const timeout = window.setTimeout(() => {
			inlineWordInput?.focus();
			inlineWordInput?.select();
		}, 0);
		return () => window.clearTimeout(timeout);
	});

	async function postLessonInline(field: 'title' | 'vocabularyType' | 'grammarMarkdown', value: string) {
		const response = await fetch(`/lessons/${data.lesson.id}/lesson-inline`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ field, value })
		});
		const payload = (await response.json()) as { message?: string };
		if (!response.ok) {
			throw new Error(payload.message ?? 'Could not save.');
		}
	}

	async function saveGrammarMarkdown(value: string) {
		await postLessonInline('grammarMarkdown', value);
		lessonGrammarMarkdown = value;
		await invalidateAll();
	}

	function getLessonWordLocal(
		lw: {
			id: string;
			sentence: { kalenjin: string; english: string } | null;
			notesMarkdown: string | null;
		}
	): LessonWordLocalState {
		return (
			lessonWordLocalState.get(lw.id) ?? {
				sentenceKalenjin: lw.sentence?.kalenjin ?? '',
				sentenceEnglish: isUnsetSentenceEnglish(lw.sentence?.english) ? '' : lw.sentence?.english ?? '',
				notesMarkdown: lw.notesMarkdown ?? ''
			}
		);
	}

	function getWordLocal(
		lw: { id: string; kalenjin: string; translations: string }
	): WordLocalState {
		return (
			wordLocalState.get(lw.id) ?? {
				kalenjin: lw.kalenjin,
				translations: lw.translations
			}
		);
	}

	function orderLessonWords<T extends { id: string }>(words: T[], orderedIds: string[]): T[] {
		if (orderedIds.length === 0) {
			return words;
		}

		const wordsById = new Map(words.map((word) => [word.id, word]));
		const ordered = orderedIds
			.map((id) => wordsById.get(id))
			.filter((word): word is T => word !== undefined);
		const orderedSet = new Set(ordered.map((word) => word.id));
		return [...ordered, ...words.filter((word) => !orderedSet.has(word.id))];
	}

	function beginInlineWordEdit(
		lw: { id: string; kalenjin: string; translations: string },
		field: InlineWordField
	) {
		inlineWordEdit = { lessonWordId: lw.id, field };
		inlineWordValue = getWordLocal(lw)[field];
		inlineWordError = null;
	}

	function cancelInlineWordEdit() {
		inlineWordEdit = null;
		inlineWordValue = '';
		inlineWordError = null;
	}

	async function saveInlineWordEdit() {
		if (!inlineWordEdit) return;
		const { lessonWordId, field } = inlineWordEdit;
		try {
			const response = await fetch(`/lessons/${data.lesson.id}/lesson-word-inline`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lessonWordId, field, value: inlineWordValue })
			});
			const result = (await response.json()) as { message?: string };
			if (!response.ok) throw new Error(result.message ?? 'Could not save.');
			const lw = flattenedLessonWords.find((w) => w.id === lessonWordId);
			if (lw) {
				wordLocalState = new Map(wordLocalState).set(lessonWordId, {
					...getWordLocal(lw),
					[field]: inlineWordValue
				});
			}
			cancelInlineWordEdit();
		} catch (err) {
			inlineWordError = err instanceof Error ? err.message : 'Could not save.';
		}
	}

	function handleInlineWordKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void saveInlineWordEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelInlineWordEdit();
		}
	}

	function beginInlineLessonWordEdit(
		lw: {
			id: string;
			sentence: { kalenjin: string; english: string } | null;
			notesMarkdown: string | null;
		},
		field: InlineLessonWordField
	) {
		inlineLessonWordEdit = { lessonWordId: lw.id, field };
		inlineLessonWordValue = getLessonWordLocal(lw)[field];
		inlineLessonWordError = null;
	}

	function cancelInlineLessonWordEdit() {
		inlineLessonWordEdit = null;
		inlineLessonWordValue = '';
		inlineLessonWordError = null;
	}

	async function saveInlineLessonWordEdit() {
		if (!inlineLessonWordEdit) return;
		const { lessonWordId, field } = inlineLessonWordEdit;
		try {
			const response = await fetch(`/lessons/${data.lesson.id}/lesson-word-inline`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lessonWordId, field, value: inlineLessonWordValue })
			});
			const result = (await response.json()) as { message?: string };
			if (!response.ok) throw new Error(result.message ?? 'Could not save.');
			const lw = flattenedLessonWords.find((w) => w.id === lessonWordId);
			if (lw) {
				lessonWordLocalState = new Map(lessonWordLocalState).set(lessonWordId, {
					...getLessonWordLocal(lw),
					[field]: inlineLessonWordValue
				});
			}
			cancelInlineLessonWordEdit();
			// Refresh page data after a Kalenjin sentence edit so SentenceTokenAnnotations
			// receives the freshly re-synced tokens rather than the stale page-load snapshot.
			if (field === 'sentenceKalenjin') {
				await invalidateAll();
			}
		} catch (err) {
			inlineLessonWordError = err instanceof Error ? err.message : 'Could not save.';
		}
	}

	function handleInlineLessonWordKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			void saveInlineLessonWordEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelInlineLessonWordEdit();
		}
	}

	function handleInlineLessonWordLineKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void saveInlineLessonWordEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelInlineLessonWordEdit();
		}
	}

	function toggleAddWordForm() {
		showAddWordForm = !showAddWordForm;
	}

	function enhanceReorderWordsForm() {
		return async ({
			result,
			update
		}: {
			result: EnhancedSubmitResult;
			update: EnhancedUpdate;
		}) => {
			if (result.type === 'success') {
				reorderWordsError = null;
				await update({ reset: false, invalidateAll: true });
				return;
			}

			const data = result.type === 'failure' ? result.data : undefined;
			reorderWordsError =
				data && 'error' in data && typeof data.error === 'string'
					? data.error
					: 'Could not save word order.';
		};
	}

	let confirmedDeleteWordId = $state<string | null>(null);

	function enhanceDeleteWordForm({
		formElement,
		formData,
		cancel
	}: {
		formElement: HTMLFormElement;
		formData: FormData;
		cancel: () => void;
	}) {
		const wordId = String(formData.get('id') ?? '');
		if (confirmedDeleteWordId !== wordId) {
			cancel();
			pendingDelete = {
				kind: 'word',
				form: formElement,
				wordLabel: formElement.dataset.wordLabel ?? ''
			};
			return;
		}
		confirmedDeleteWordId = null;
		return async ({
			result,
			update
		}: {
			result: EnhancedSubmitResult;
			update: EnhancedUpdate;
		}) => {
			await update({ reset: false, invalidateAll: true });
			if (result.type !== 'success' && result.type !== 'failure') {
				await applyAction(result);
			}
		};
	}

	function requestDeleteLesson(event: SubmitEvent) {
		if (pendingDelete?.kind === 'lesson' && pendingDelete.form === event.currentTarget) {
			return;
		}
		event.preventDefault();
		pendingDelete = {
			kind: 'lesson',
			form: event.currentTarget as HTMLFormElement
		};
	}

	function cancelPendingDelete() {
		pendingDelete = null;
	}

	function confirmPendingDelete() {
		if (!pendingDelete) return;
		const { form, kind } = pendingDelete;
		pendingDelete = null;
		if (kind === 'word') {
			const wordId = String(new FormData(form).get('id') ?? '');
			confirmedDeleteWordId = wordId;
			form.requestSubmit();
		} else {
			form.submit();
		}
	}

	function handleLessonWordDragStart(event: DragEvent, lessonWordId: string) {
		draggedLessonWordId = lessonWordId;
		dropTargetLessonWordId = null;
		reorderWordsError = null;
		event.dataTransfer?.setData('text/plain', lessonWordId);
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleLessonWordDragOver(event: DragEvent, lessonWordId: string) {
		if (!draggedLessonWordId || draggedLessonWordId === lessonWordId) {
			return;
		}

		event.preventDefault();
		dropTargetLessonWordId = lessonWordId;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	function handleLessonWordDragLeave(lessonWordId: string) {
		if (dropTargetLessonWordId === lessonWordId) {
			dropTargetLessonWordId = null;
		}
	}

	function handleLessonWordDragEnd() {
		draggedLessonWordId = null;
		dropTargetLessonWordId = null;
	}

	function handleLessonWordDrop(event: DragEvent, targetLessonWordId: string) {
		event.preventDefault();
		const sourceLessonWordId =
			draggedLessonWordId || event.dataTransfer?.getData('text/plain') || null;
		draggedLessonWordId = null;
		dropTargetLessonWordId = null;

		if (!sourceLessonWordId || sourceLessonWordId === targetLessonWordId) {
			return;
		}

		const nextOrder = [...lessonWordOrder];
		const sourceIndex = nextOrder.indexOf(sourceLessonWordId);
		const targetIndex = nextOrder.indexOf(targetLessonWordId);
		if (sourceIndex < 0 || targetIndex < 0) {
			return;
		}

		const [movedId] = nextOrder.splice(sourceIndex, 1);
		nextOrder.splice(targetIndex, 0, movedId);
		lessonWordOrder = nextOrder;
		window.setTimeout(() => reorderWordsForm?.requestSubmit(), 0);
	}
</script>

<section class="lesson-page">
	<LessonHeader
		lessonId={data.lesson.id}
		lessonOrder={data.lesson.lessonOrder}
		{lessonType}
		bind:lessonTitle
		bind:lessonVocabularyType
		prevLesson={data.prevLesson}
		nextLesson={data.nextLesson}
		levelLessons={data.levelLessons}
		onSaveField={postLessonInline}
		onDeleteRequest={requestDeleteLesson}
	/>

	{#if lessonType === 'VOCABULARY'}
		<GrammarNotes source={lessonGrammarMarkdown} onSave={saveGrammarMarkdown} />
	{/if}

	{#if form?.error}
		<p class="error">{form.error}</p>
	{:else if form?.updateLessonSuccess}
		<p class="success">Saved lesson changes.</p>
	{:else if form?.createWordSuccess}
		<p class="success">Created lesson word.</p>
	{:else if form?.deleteWordSuccess}
		<p class="success">Deleted lesson word.</p>
	{:else if form?.reorderWordsSuccess}
		<p class="success">Saved word order.</p>
	{:else if form?.updateExampleSentenceTokenSuccess}
		<p class="success">Saved sentence annotation.</p>
	{:else if form?.createExampleSentenceWordSuccess}
		<p class="success">Created lemma and linked it.</p>
	{/if}


	{#if data.storyWordCoverage}
		<WordCoveragePanel title="Word coverage" entries={data.storyWordCoverage} />
	{/if}

	{#if data.lesson.type === 'STORY'}
		<LessonStorySection
			lessonId={data.lesson.id}
			sentences={data.lesson.story?.sentences ?? []}
			dictionaryWords={data.words}
			ignoredNormalizedForms={data.ignoredNormalizedForms}
		/>
	{:else}
		{#if data.vocabWordCoverage}
			<div class="lesson-vocab-top" class:expanded={vocabPanelsOpen}>
				<div class="lesson-vocab-top-main">
					<WordCoveragePanel
						title="Next story coverage"
						entries={data.vocabWordCoverage.words}
						storyLesson={data.vocabWordCoverage.storyLesson}
						quickAddAction="?/quickAddWord"
						bind:open={vocabPanelsOpen}
					/>
				</div>
				<CefrBrowseSidebar
					level={data.lesson.level}
					query={data.cefrBrowse.query}
					sort={data.cefrBrowse.sort}
					coverageFilter={data.cefrBrowse.coverageFilter}
					posFilters={data.cefrBrowse.posFilters}
					posOptions={data.cefrBrowse.posOptions}
					targets={data.cefrBrowse.targets}
					page={data.cefrBrowse.page}
					totalPages={data.cefrBrowse.totalPages}
					filteredCount={data.cefrBrowse.filteredCount}
					totalCount={data.cefrBrowse.totalCount}
					coveredCount={data.cefrBrowse.coveredCount}
					isRandom={data.cefrBrowse.isRandom}
					buildUrl={buildLessonCefrUrl}
					collapsible
					bind:expanded={vocabPanelsOpen}
				/>
			</div>
		{/if}

		<div class="words-head">
			<div class="words-head-left">
				<div class="words-head-num">{flattenedLessonWords.length}</div>
				<div>
					<h3 class="lesson-section-title">Lesson words</h3>
					<div class="words-head-sub">
						{#if flattenedLessonWords.length === 0}
							No words yet
						{:else if displaySections.length === 1}
							in 1 section
						{:else}
							across {displaySections.length} sections
						{/if}
					</div>
				</div>
			</div>
			<div class="words-head-right">
				{#if flattenedLessonWords.length > 0 && displaySections.length > 1}
					<div class="section-pips">
						{#each displaySections as section}
							<div class="section-pip" title="Section {section.sectionNumber} · {section.items.length} word{section.items.length === 1 ? '' : 's'}">
								<span class="pip-label">S{section.sectionNumber}</span>
								<span class="pip-count">{section.items.length}</span>
							</div>
						{/each}
					</div>
				{/if}
				<button type="button" class="btn ghost" onclick={toggleAddWordForm}>
					{showAddWordForm ? 'Close' : 'Add word'}
				</button>
			</div>
		</div>

		{#if showAddWordForm}
			<LessonAddWordForm
				lessonId={data.lesson.id}
				onSuccess={() => (showAddWordForm = false)}
			/>
		{/if}

		{#if flattenedLessonWords.length === 0}
			<section class="content-card">
				<p class="muted">No lesson words yet.</p>
			</section>
		{:else}
			<form
				method="POST"
				action="?/reorderWords"
				class="sr-only"
				bind:this={reorderWordsForm}
				use:enhance={enhanceReorderWordsForm}
			>
				<input type="hidden" name="orderedIds" value={JSON.stringify(lessonWordOrder)} />
				<button type="submit">Save word order</button>
			</form>
			{#if reorderWordsError}
				<p class="error-text">{reorderWordsError}</p>
			{/if}
			<div class="sections-stack" aria-label="Lesson words">
				{#each displaySections as section}
					<section class="content-card section-card">
						<div class="section-label">Section {section.sectionNumber}</div>

						<div class="table-header vocab-grid">
							<span></span>
							<span>Word</span>
							<span>Sentence</span>
							<span>Translation &amp; notes</span>
							<span></span>
						</div>
						<div role="list" aria-label={`Section ${section.sectionNumber}`}>

						{#each section.items as lessonWord (lessonWord.id)}
							{@const lwLocal = getLessonWordLocal(lessonWord)}
							<div
								class="table-row vocab-grid vocab-row"
								role="listitem"
								class:vocab-row--dragging={draggedLessonWordId === lessonWord.id}
								class:vocab-row--drop-target={dropTargetLessonWordId === lessonWord.id}
								ondragover={(event) => handleLessonWordDragOver(event, lessonWord.id)}
								ondragleave={() => handleLessonWordDragLeave(lessonWord.id)}
								ondrop={(event) => handleLessonWordDrop(event, lessonWord.id)}
							>
								<div class="drag-cell">
									<button
										type="button"
										class="drag-handle"
										aria-label={`Move ${getWordLocal(lessonWord).kalenjin}`}
										title="Drag to reorder"
										draggable="true"
										ondragstart={(event) => handleLessonWordDragStart(event, lessonWord.id)}
										ondragend={handleLessonWordDragEnd}
									>
										<svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
											<circle cx="5" cy="3" r="1.2" />
											<circle cx="11" cy="3" r="1.2" />
											<circle cx="5" cy="8" r="1.2" />
											<circle cx="11" cy="8" r="1.2" />
											<circle cx="5" cy="13" r="1.2" />
											<circle cx="11" cy="13" r="1.2" />
										</svg>
									</button>
								</div>
								<div class="word-cell">
									{#if inlineWordEdit?.lessonWordId === lessonWord.id && inlineWordEdit.field === 'kalenjin'}
										<input bind:this={inlineWordInput} class="inline-edit-input word-inline-input word-kalenjin-input" bind:value={inlineWordValue} onkeydown={handleInlineWordKeydown} onblur={() => void saveInlineWordEdit()} />
									{:else}
										<div class="word-kalenjin-row">
											<AudioPlayButton
												audioUrl={lessonWord.word?.audioUrl ?? null}
												size="sm"
												label={`Play pronunciation of ${getWordLocal(lessonWord).kalenjin}`}
											/>
											<button
												type="button"
												class="inline-edit-button word-kalenjin"
												class:word-kalenjin--usage-warning={Boolean(lessonWord.otherLessons?.length)}
												onclick={() => beginInlineWordEdit(lessonWord, 'kalenjin')}
												>{getWordLocal(lessonWord).kalenjin}</button
											>
										</div>
									{/if}
									{#if inlineWordEdit?.lessonWordId === lessonWord.id && inlineWordEdit.field === 'translations'}
										<input bind:this={inlineWordInput} class="inline-edit-input word-inline-input word-translations-input" bind:value={inlineWordValue} onkeydown={handleInlineWordKeydown} onblur={() => void saveInlineWordEdit()} />
									{:else}
										<button type="button" class="inline-edit-button word-translations" onclick={() => beginInlineWordEdit(lessonWord, 'translations')}>{stripWordLinks(getWordLocal(lessonWord).translations)}</button>
									{/if}
									{#if inlineWordError && inlineWordEdit?.lessonWordId === lessonWord.id}
										<p class="error-text">{inlineWordError}</p>
									{/if}
									{#if lessonWord.otherLessons?.length}
										<div class="lesson-word-usage-warning">
											<span>
												Taught in
												{#each lessonWord.otherLessons as lesson, index}
													<a href={`/lessons/${lesson.id}`} target="_blank" rel="noopener"
														>{lesson.title}</a
													>{#if index < lessonWord.otherLessons.length - 1}, {/if}
												{/each}.
											</span>
										</div>
									{/if}
								</div>
							<div class="vocab-text-cell">
								{#if inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'sentenceKalenjin'}
									<textarea bind:this={inlineLessonWordInput} class="inline-edit-input" rows="2" bind:value={inlineLessonWordValue} onkeydown={handleInlineLessonWordLineKeydown} onblur={() => void saveInlineLessonWordEdit()}></textarea>
								{:else if !lessonWord.sentence}
									<button type="button" class="inline-edit-button empty-sentence-button" class:sentence-notes-empty={!lwLocal.sentenceKalenjin} onclick={() => beginInlineLessonWordEdit(lessonWord, 'sentenceKalenjin')}>{lwLocal.sentenceKalenjin || 'Add sentence'}</button>
								{:else}
									{@const prevExampleWord = findAdjacentLessonWordWithSentence(
										lessonWord.id,
										'prev'
									)}
									{@const nextExampleWord = findAdjacentLessonWordWithSentence(
										lessonWord.id,
										'next'
									)}
									<div class="sentence-annotation-shell">
										<AudioPlayButton
											audioUrl={lessonWord.sentence.audioUrl}
											size="sm"
											label="Play sentence"
										/>
										<SentenceTokenAnnotations
											entityId={lessonWord.id}
											entityIdField="lessonWordId"
											entityKind="example"
											sentenceId={lessonWord.sentence.id}
											sentenceText={lessonWord.sentence.kalenjin}
											tokens={lessonWord.sentence.tokens}
											dictionaryWords={data.words}
											ignoredNormalizedForms={data.ignoredNormalizedForms}
											updateAction="?/updateExampleSentenceToken"
											createAction="?/createExampleSentenceWord"
											searchEndpoint={`/lessons/${data.lesson.id}/word-search`}
											tokenGroupEndpoint={`/corpus/${lessonWord.sentence.id}/token-groups`}
											focusRequest={exampleFocusRequests[lessonWord.sentence.id] ?? null}
											onNavigatePrevSentence={prevExampleWord?.sentence
												? () =>
														focusExampleSentence(prevExampleWord.sentence!.id, 'last')
												: undefined}
											onNavigateNextSentence={nextExampleWord?.sentence
												? () =>
														focusExampleSentence(nextExampleWord.sentence!.id, 'first')
												: undefined}
										/>
										<button
											type="button"
											class="btn ghost sentence-edit-button"
											aria-label={replaceSentenceLabel}
											data-tooltip={replaceSentenceLabel}
											onclick={() => beginInlineLessonWordEdit(lessonWord, 'sentenceKalenjin')}
										>
											<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
												<path
													d="M7 7h9.2l-1.8-1.8L16 3.6 20.4 8 16 12.4l-1.6-1.6L16.2 9H7a3 3 0 0 0-3 3v1H2v-1a5 5 0 0 1 5-5Zm10 10H7.8l1.8 1.8L8 20.4 3.6 16 8 11.6l1.6 1.6L7.8 15H17a3 3 0 0 0 3-3v-1h2v1a5 5 0 0 1-5 5Z"
												/>
											</svg>
										</button>
									</div>
								{/if}
								{#if inlineLessonWordError && inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'sentenceKalenjin'}
									<p class="error-text">{inlineLessonWordError}</p>
								{/if}
							</div>
							<div class="translation-cell">
								{#if inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'sentenceEnglish'}
									<textarea bind:this={inlineLessonWordInput} class="inline-edit-input sentence-english-input inline-translation-input" rows="2" bind:value={inlineLessonWordValue} onkeydown={handleInlineLessonWordLineKeydown} onblur={() => void saveInlineLessonWordEdit()}></textarea>
								{:else if lessonWord.sentence}
									<button type="button" class="inline-edit-button sentence-english-text" class:sentence-notes-empty={!lwLocal.sentenceEnglish} onclick={() => beginInlineLessonWordEdit(lessonWord, 'sentenceEnglish')}>
										{#if lwLocal.sentenceEnglish}
											<SentenceTimeText text={lwLocal.sentenceEnglish} />
										{:else}
											{missingSentenceTranslationLabel}
										{/if}
									</button>
								{:else}
									<button type="button" class="inline-edit-button sentence-english-text sentence-notes-empty" disabled>{missingSentenceTranslationLabel}</button>
								{/if}
								{#if inlineLessonWordError && inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'sentenceEnglish'}
									<p class="error-text">{inlineLessonWordError}</p>
								{/if}

								<div class="sentence-notes">
									<div class="notes-label">Notes</div>

									{#if inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'notesMarkdown'}
										<textarea bind:this={inlineLessonWordInput} class="inline-edit-input sentence-notes-input" rows="3" bind:value={inlineLessonWordValue} onkeydown={handleInlineLessonWordKeydown}></textarea>
										<div class="inline-actions compact-actions">
											<button type="button" class="btn btn-sm" onclick={() => void saveInlineLessonWordEdit()}>Save notes</button>
											<button type="button" class="btn ghost btn-sm" onclick={cancelInlineLessonWordEdit}>Cancel</button>
										</div>
									{:else}
										<button type="button" class="inline-edit-button sentence-notes-text" class:sentence-notes-empty={!lwLocal.notesMarkdown} onclick={() => beginInlineLessonWordEdit(lessonWord, 'notesMarkdown')}>{lwLocal.notesMarkdown || 'Add notes'}</button>
									{/if}
									{#if inlineLessonWordError && inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'notesMarkdown'}
										<p class="error-text">{inlineLessonWordError}</p>
									{/if}
								</div>
							</div>
							<div class="row-action">
								<form
									method="POST"
									action="?/deleteWord"
									class="inline-delete"
									data-word-label={getWordLocal(lessonWord).kalenjin || lessonWord.kalenjin}
									use:enhance={enhanceDeleteWordForm}
								>
									<input type="hidden" name="id" value={lessonWord.id} />
									<button type="submit" class="btn ghost btn-sm">Delete</button>
								</form>
							</div>
						</div>

						<LessonWordCefrRow
							lessonId={data.lesson.id}
							{lessonWord}
							translations={getWordLocal(lessonWord).translations}
							cefrTargets={data.cefrTargets}
						/>

						{/each}
						</div>
					</section>
				{/each}
			</div>
		{/if}
	{/if}
</section>

<ConfirmDialog
	open={pendingDelete !== null}
	title={pendingDelete?.kind === 'lesson' ? 'Delete lesson?' : 'Delete word?'}
	message={pendingDelete?.kind === 'lesson'
		? `"${lessonTitle}" will be removed along with its words and sentences. Dictionary entries stay.`
		: pendingDelete?.kind === 'word'
			? `Remove "${pendingDelete.wordLabel}" from this lesson?`
			: ''}
	confirmLabel={pendingDelete?.kind === 'lesson' ? 'Delete lesson' : 'Delete word'}
	variant="danger"
	onconfirm={confirmPendingDelete}
	oncancel={cancelPendingDelete}
/>

<style>
	.lesson-page {
		display: grid;
		gap: 1rem;
	}

	.lesson-vocab-top {
		display: grid;
		gap: 1.5rem;
		margin-bottom: 1rem;
	}

	.lesson-vocab-top-main {
		min-width: 0;
	}

	.lesson-vocab-top :global(.coverage-card),
	.lesson-vocab-top :global(.cefr-sidebar) {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.lesson-vocab-top :global(.coverage-list),
	.lesson-vocab-top :global(.cefr-target-list) {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	@media (min-width: 1100px) {
		.lesson-vocab-top {
			grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
			align-items: stretch;
		}

		.lesson-vocab-top.expanded :global(.coverage-card),
		.lesson-vocab-top.expanded :global(.cefr-sidebar) {
			height: 520px;
		}
	}

	.content-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 1rem 1.25rem;
	}

	.words-head {
		align-items: center;
		border-bottom: 1px solid var(--line);
		display: flex;
		gap: 24px;
		justify-content: space-between;
		margin: 12px 0 18px;
		padding-bottom: 18px;
	}

	.words-head-left {
		align-items: center;
		display: flex;
		gap: 20px;
	}

	.words-head-num {
		color: var(--brand);
		font-family: var(--font-display);
		font-size: 56px;
		font-variant-numeric: tabular-nums;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1;
	}

	.lesson-section-title {
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 500;
		margin: 0;
	}

	.words-head-sub {
		color: var(--ink-soft);
		font-size: 14px;
		margin-top: 2px;
	}

	.words-head-right {
		align-items: center;
		display: flex;
		gap: 16px;
	}

	.section-pips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.section-pip {
		align-items: baseline;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		display: flex;
		font-family: var(--font-mono);
		font-size: 13px;
		gap: 6px;
		padding: 8px 12px;
	}

	.pip-label {
		color: var(--ink-mute);
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.pip-count {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 18px;
		font-variant-numeric: tabular-nums;
		font-weight: 500;
	}

	.sections-stack {
		display: grid;
		gap: 1rem;
	}

	.section-card {
		padding: 1.25rem 1.25rem 0.5rem;
	}

	.section-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.16em;
		margin: 0 0 0.75rem;
		text-align: right;
		text-transform: uppercase;
	}

	.notes-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.14em;
		margin-bottom: 2px;
		text-transform: uppercase;
	}

	.error {
		color: oklch(0.45 0.15 25);
		font-weight: 600;
	}

	.success {
		color: oklch(0.45 0.15 150);
		font-weight: 600;
	}

	.error-text {
		color: oklch(0.45 0.15 25);
		font-weight: 600;
	}

	.sr-only {
		height: 1px;
		margin: -1px;
		overflow: hidden;
		padding: 0;
		position: absolute;
		width: 1px;
	}

	.table-header,
	.table-row {
		align-items: start;
		border-top: 1px solid var(--line-soft);
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem 0;
	}

	.table-header {
		border-top: 0;
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		padding-top: 0;
		text-transform: uppercase;
	}

	.sentence-notes {
		border-top: 1px solid var(--line-soft);
		display: grid;
		gap: 0.3rem;
		padding-top: 0.45rem;
	}

	.inline-translation-input {
		min-height: 3.25rem;
		resize: vertical;
		white-space: pre-wrap;
	}

	.compact-actions {
		gap: 0.45rem;
	}

	.vocab-grid {
		grid-template-columns: 2rem minmax(150px, 0.8fr) minmax(320px, 2fr) minmax(240px, 1.4fr) auto;
	}

	.vocab-row {
		transition: background 0.12s ease, opacity 0.12s ease;
	}

	.vocab-row:hover {
		background: var(--surface);
	}

	.vocab-row--dragging {
		opacity: 0.5;
	}

	.vocab-row--drop-target {
		background: color-mix(in oklch, var(--brand) 8%, transparent);
		box-shadow: inset 0 2px 0 var(--brand);
	}

	.drag-cell {
		align-items: start;
		display: flex;
		justify-content: center;
	}

	.drag-handle {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: var(--radius);
		color: var(--ink-mute);
		cursor: grab;
		display: inline-flex;
		height: 2rem;
		justify-content: center;
		padding: 0;
		width: 1.75rem;
	}

	.drag-handle:hover,
	.drag-handle:focus-visible {
		background: var(--surface);
		color: var(--ink);
	}

	.drag-handle:active {
		cursor: grabbing;
	}

	.drag-handle svg {
		fill: currentColor;
		height: 1rem;
		width: 1rem;
	}

	.word-cell {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.word-kalenjin {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 500;
	}

	.word-kalenjin-row {
		align-items: center;
		display: flex;
		gap: 0.4rem;
	}

	.word-translations {
		color: var(--ink-soft);
		font-size: 13px;
	}

	.word-kalenjin--usage-warning {
		color: oklch(0.56 0.12 25);
		font-weight: 700;
	}

	.lesson-word-usage-warning {
		color: oklch(0.45 0.15 25);
		font-size: 12px;
		font-weight: 600;
		margin-top: 0.35rem;
	}

	.lesson-word-usage-warning a {
		color: var(--brand);
		font-weight: 600;
	}

	.word-inline-input {
		background: transparent;
		border: 0;
		border-bottom: 1px solid transparent;
		outline: none;
		padding: 0;
		width: 100%;
	}

	.word-inline-input:focus {
		border-bottom-color: var(--brand);
	}

	.word-translations-input {
		color: var(--ink-soft);
		font-size: 13px;
	}

	.vocab-text-cell {
		align-self: stretch;
		min-width: 0;
	}

	.sentence-annotation-shell {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.sentence-edit-button {
		align-items: center;
		border-radius: var(--radius);
		display: inline-flex;
		height: 2rem;
		justify-content: center;
		padding: 0;
		position: relative;
		width: 2rem;
	}

	.sentence-edit-button svg {
		fill: currentColor;
		height: 1rem;
		width: 1rem;
	}

	.sentence-edit-button::after {
		background: var(--ink);
		border-radius: 3px;
		bottom: calc(100% + 0.35rem);
		color: var(--bg-raised);
		content: attr(data-tooltip);
		font-size: 0.78rem;
		left: 50%;
		line-height: 1.2;
		opacity: 0;
		padding: 0.3rem 0.4rem;
		pointer-events: none;
		position: absolute;
		transform: translateX(-50%);
		transition: opacity 0.04s ease;
		white-space: nowrap;
		z-index: 20;
	}

	.sentence-edit-button:hover::after,
	.sentence-edit-button:focus-visible::after {
		opacity: 1;
	}

	.empty-sentence-button {
		align-items: center;
		border: 1px dashed var(--line);
		border-radius: var(--radius);
		box-sizing: border-box;
		color: var(--ink-mute);
		display: flex;
		min-height: 4.5rem;
		padding: 0.45rem 0.5rem;
		width: 100%;
	}

	.empty-sentence-button:hover {
		background: var(--surface);
		border-color: var(--ink-mute);
		color: var(--ink);
	}

	.sentence-english-text {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 16px;
		font-style: italic;
	}

	.sentence-english-input {
		font-family: var(--font-display);
		font-style: italic;
	}

	.sentence-notes-text {
		color: var(--ink-soft);
		font-size: 13px;
		line-height: 1.45;
		white-space: pre-wrap;
	}

	.sentence-notes-empty {
		color: var(--ink-mute);
	}

	.row-action {
		align-items: start;
		display: flex;
		gap: 0.4rem;
		justify-content: end;
		padding-right: 0.5rem;
	}

	.inline-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.inline-delete {
		margin: 0;
	}

	.inline-delete button {
		transition: background-color 0.15s, border-color 0.15s, color 0.15s;
	}

	.inline-delete button:hover,
	.inline-delete button:focus-visible {
		background: oklch(0.96 0.02 25);
		border-color: oklch(0.85 0.06 25);
		color: oklch(0.45 0.15 25);
		outline: none;
	}

	.inline-edit-button {
		background: transparent;
		border: 0;
		cursor: text;
		font: inherit;
		padding: 0;
		text-align: left;
	}

	.inline-edit-button.word-kalenjin {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 500;
	}

	.inline-edit-button.sentence-english-text {
		font-family: var(--font-display);
		font-style: italic;
	}

	.inline-edit-input {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--ink);
		font: inherit;
		padding: 0.25rem 0.4rem;
		transition: border-color 0.15s, box-shadow 0.15s;
		width: 100%;
	}

	.inline-edit-input:focus {
		border-color: var(--brand);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand) 18%, transparent);
		outline: none;
	}

	@media (max-width: 800px) {
		.words-head,
		.vocab-grid {
			display: grid;
			grid-template-columns: 1fr;
		}

		.words-head-right {
			justify-content: flex-start;
		}

		.row-action {
			justify-content: start;
		}
	}
</style>
