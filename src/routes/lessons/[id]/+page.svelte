<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import LessonFormFields from '$lib/components/LessonFormFields.svelte';
	import SentenceTokenAnnotations from '$lib/components/SentenceTokenAnnotations.svelte';
	import WordCoveragePanel from '$lib/components/WordCoveragePanel.svelte';
	import {
		formatLessonType,
		formatVocabularyLessonType,
		splitLessonItemsIntoSections
	} from '$lib/course';
	import { suggestCefrTargets } from '$lib/cefr-suggestions';

	let { data, form } = $props();

	type LessonType = 'VOCABULARY' | 'STORY';
	type VocabularyType = '' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION';
	type StorySentence = NonNullable<typeof data.lesson.story>['sentences'][number];
	type InlineStoryField = 'speaker' | 'english' | 'grammarNotes';

	let showLessonEdit = $state(false);
	let showAddWordForm = $state(false);
	let inlineStoryEdit = $state<{ sentenceId: string; field: InlineStoryField } | null>(null);
	let inlineStoryValue = $state('');
	let inlineStoryError = $state<string | null>(null);
	let storySentences = $state<StorySentence[]>([]);
	let inlineStoryInput = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

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
	let inlineWordEdit = $state<{ lessonWordId: string; wordId: string; field: InlineWordField } | null>(null);
	let inlineWordValue = $state('');
	let inlineWordError = $state<string | null>(null);
	let inlineWordInput = $state<HTMLInputElement | null>(null);
	let wordLocalState = $state(new Map<string, WordLocalState>());

	let cefrLocalTargets = $state(new Map<string, string[]>());
	let cefrDismissed = $state(new Map<string, Set<string>>());
	let cefrSearchQuery = $state(new Map<string, string>());
	let cefrSearchOpen = $state(new Map<string, boolean>());

	let lessonTitle = $state('');
	let lessonType = $state<LessonType>('VOCABULARY');
	let lessonVocabularyType = $state<VocabularyType>('VOCAB');
	let lessonGrammarMarkdown = $state('');

	type EnhancedSubmitResult = ActionResult<Record<string, unknown> | undefined, Record<string, unknown> | undefined>;
	type EnhancedUpdate = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;

	type CefrTarget = (typeof data.cefrTargets)[number];

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
	const displaySections = $derived(splitLessonItemsIntoSections(flattenedLessonWords));

	$effect(() => {
		lessonTitle = data.lesson.title;
		lessonType = data.lesson.type;
		lessonVocabularyType = data.lesson.vocabularyType ?? 'VOCAB';
		lessonGrammarMarkdown = data.lesson.grammarMarkdown ?? '';
		storySentences = data.lesson.story?.sentences.map((sentence) => ({ ...sentence })) ?? [];
	});

	$effect(() => {
		if (!inlineStoryEdit) {
			return;
		}

		const timeout = window.setTimeout(() => {
			inlineStoryInput?.focus();
			inlineStoryInput?.select();
		}, 0);

		return () => window.clearTimeout(timeout);
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

	function isTargetSelected(
		targetId: string,
		selectedTargets: Array<{ id: string }>
	): boolean {
		return selectedTargets.some((target) => target.id === targetId);
	}

	function beginInlineStoryEdit(sentence: (typeof storySentences)[number], field: InlineStoryField) {
		inlineStoryEdit = { sentenceId: sentence.id, field };
		inlineStoryValue =
			field === 'speaker'
				? sentence.speaker ?? ''
				: field === 'grammarNotes'
					? sentence.grammarNotes ?? ''
					: sentence.english;
		inlineStoryError = null;
	}

	function cancelInlineStoryEdit() {
		inlineStoryEdit = null;
		inlineStoryValue = '';
		inlineStoryError = null;
	}

	async function saveInlineStoryEdit() {
		if (!inlineStoryEdit) {
			return;
		}

		try {
			const response = await fetch(`/lessons/${data.lesson.id}/story-sentence-inline`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					sentenceId: inlineStoryEdit.sentenceId,
					field: inlineStoryEdit.field,
					value: inlineStoryValue
				})
			});

			const result = (await response.json()) as {
				error?: string;
				sentence?: {
					id: string;
					speaker: string | null;
					english: string;
					grammarNotes: string | null;
				};
			};

			if (!response.ok || !result.sentence) {
				throw new Error(result.error ?? 'Could not save story field.');
			}

			storySentences = storySentences.map((sentence) =>
				sentence.id === result.sentence?.id
					? {
							...sentence,
							speaker: result.sentence.speaker,
							english: result.sentence.english,
							grammarNotes: result.sentence.grammarNotes
						}
					: sentence
			);
			cancelInlineStoryEdit();
		} catch (saveError) {
			inlineStoryError =
				saveError instanceof Error ? saveError.message : 'Could not save story field.';
		}
	}

	function handleInlineStoryKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void saveInlineStoryEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelInlineStoryEdit();
		}
	}

	function handleInlineStoryNotesKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			void saveInlineStoryEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelInlineStoryEdit();
		}
	}

	function saveInlineStoryEditOnBlur() {
		void saveInlineStoryEdit();
	}

	function getLessonWordLocal(
		lw: {
			id: string;
			sentence: { kalenjin: string; english: string };
			notesMarkdown: string | null;
		}
	): LessonWordLocalState {
		return (
			lessonWordLocalState.get(lw.id) ?? {
				sentenceKalenjin: lw.sentence.kalenjin,
				sentenceEnglish: lw.sentence.english,
				notesMarkdown: lw.notesMarkdown ?? ''
			}
		);
	}

	function getWordLocal(
		lw: { id: string; word: { id: string; kalenjin: string; translations: string } }
	): WordLocalState {
		return (
			wordLocalState.get(lw.id) ?? {
				kalenjin: lw.word.kalenjin,
				translations: lw.word.translations
			}
		);
	}

	function beginInlineWordEdit(
		lw: { id: string; word: { id: string; kalenjin: string; translations: string } },
		field: InlineWordField
	) {
		inlineWordEdit = { lessonWordId: lw.id, wordId: lw.word.id, field };
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
		const { lessonWordId, wordId, field } = inlineWordEdit;
		try {
			const response = await fetch(`/dictionary/${wordId}/inline`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ field, value: inlineWordValue })
			});
			const result = (await response.json()) as { error?: string };
			if (!response.ok) throw new Error(result.error ?? 'Could not save.');
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
			sentence: { kalenjin: string; english: string };
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
			const result = (await response.json()) as { error?: string };
			if (!response.ok) throw new Error(result.error ?? 'Could not save.');
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

	function getCefrCoveredIds(lw: { id: string; coveredCefrTargets: { id: string }[] }): string[] {
		return cefrLocalTargets.get(lw.id) ?? lw.coveredCefrTargets.map((t) => t.id);
	}

	function getCefrCoveredTargets(lw: { id: string; coveredCefrTargets: { id: string }[] }) {
		const ids = getCefrCoveredIds(lw);
		return ids
			.map((id) => data.cefrTargets.find((t) => t.id === id))
			.filter((target): target is CefrTarget => target !== undefined);
	}

	function isCefrTargetUsedByAnotherWord(target: CefrTarget, lessonWordId: string): boolean {
		return Boolean(target.coveredByLessonWordId && target.coveredByLessonWordId !== lessonWordId);
	}

	function getCefrSuggestions(lw: { id: string; coveredCefrTargets: { id: string }[]; word: { id: string; kalenjin: string; translations: string } }) {
		const coveredIds = new Set(getCefrCoveredIds(lw));
		const dismissed = cefrDismissed.get(lw.id) ?? new Set<string>();
		return suggestCefrTargets(getWordLocal(lw).translations, data.cefrTargets, coveredIds).filter(
			(t) => !dismissed.has(t.id)
		);
	}

	function getCefrSearchResults(lw: { id: string; coveredCefrTargets: { id: string }[] }) {
		const query = (cefrSearchQuery.get(lw.id) ?? '').toLowerCase().trim();
		if (!query) return [];
		const coveredIds = new Set(getCefrCoveredIds(lw));
		return data.cefrTargets
			.filter(
				(t) =>
					!coveredIds.has(t.id) &&
					(t.english.toLowerCase().includes(query) || t.level.toLowerCase().includes(query))
			)
			.slice(0, 8);
	}

	function resetCefrSearch(lessonWordId: string) {
		cefrSearchQuery = new Map(cefrSearchQuery).set(lessonWordId, '');
		cefrSearchOpen = new Map(cefrSearchOpen).set(lessonWordId, false);
	}

	async function addCefrTarget(lessonWordId: string, targetId: string) {
		const response = await fetch(`/lessons/${data.lesson.id}/cefr-target`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ lessonWordId, targetId, action: 'add' })
		});
		if (response.ok) {
			const lw = flattenedLessonWords.find((w) => w.id === lessonWordId);
			if (lw) {
				cefrLocalTargets = new Map(cefrLocalTargets).set(lessonWordId, [
					...new Set([...getCefrCoveredIds(lw), targetId])
				]);
			}
		}
	}

	async function removeCefrTarget(lessonWordId: string, targetId: string) {
		const response = await fetch(`/lessons/${data.lesson.id}/cefr-target`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ lessonWordId, targetId, action: 'remove' })
		});
		if (response.ok) {
			const lw = flattenedLessonWords.find((w) => w.id === lessonWordId);
			if (lw) {
				cefrLocalTargets = new Map(cefrLocalTargets).set(
					lessonWordId,
					getCefrCoveredIds(lw).filter((id) => id !== targetId)
				);
			}
		}
	}

	function dismissCefrSuggestion(lessonWordId: string, targetId: string) {
		const current = cefrDismissed.get(lessonWordId) ?? new Set<string>();
		cefrDismissed = new Map(cefrDismissed).set(lessonWordId, new Set([...current, targetId]));
	}

	function toggleAddWordForm() {
		showAddWordForm = !showAddWordForm;
	}

	function enhanceAddWordForm() {
		return async ({
			result,
			update
		}: {
			result: EnhancedSubmitResult;
			update: EnhancedUpdate;
		}) => {
			if (result.type === 'success') {
				await update({ reset: true, invalidateAll: true });
				showAddWordForm = false;
				return;
			}
			await applyAction(result);
		};
	}
</script>

<section class="lesson-page">
	<div class="page-header">
		<div>
			<h1>{data.lesson.title}</h1>
			<p class="summary-line">
				{formatLessonType(data.lesson.type)}
				{#if data.lesson.vocabularyType}
					({formatVocabularyLessonType(data.lesson.vocabularyType)})
				{/if}
				· Lesson {data.lesson.lessonOrder}
			</p>
		</div>
		<a href="/lessons">Back to lessons</a>
	</div>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{:else if form?.updateLessonSuccess}
		<p class="success">Saved lesson changes.</p>
	{:else if form?.createWordSuccess}
		<p class="success">Created lesson word.</p>
	{:else if form?.updateStorySentenceSuccess}
		<p class="success">Saved story sentence.</p>
	{:else if form?.deleteWordSuccess}
		<p class="success">Deleted lesson word.</p>
	{:else if form?.updateStorySentenceTokenSuccess || form?.updateExampleSentenceTokenSuccess}
		<p class="success">Saved sentence annotation.</p>
	{:else if form?.createStorySentenceWordSuccess || form?.createExampleSentenceWordSuccess}
		<p class="success">Created lemma and linked it.</p>
	{/if}

	<section class="summary-card">
		<div class="card-header">
			<div>
				<strong>Lesson details</strong>
				<p class="summary-line">
					{#if data.lesson.type === 'STORY'}
						{data.lesson.story?.sentences.length ?? 0} sentence(s)
					{:else}
						{flattenedLessonWords.length} word(s)
					{/if}
				</p>
			</div>
			<button type="button" class="secondary-button" onclick={() => (showLessonEdit = !showLessonEdit)}>
				{showLessonEdit ? 'Close' : 'Edit'}
			</button>
		</div>

		{#if showLessonEdit}
			<form method="POST" action="?/updateLesson" class="editor-form compact-form">
				<label>
					Lesson order
					<input name="lessonOrder" type="number" min="1" required value={data.lesson.lessonOrder} />
				</label>

				<LessonFormFields
					bind:title={lessonTitle}
					bind:type={lessonType}
					bind:vocabularyType={lessonVocabularyType}
					bind:grammarMarkdown={lessonGrammarMarkdown}
					showStoryImport={false}
					lessonTypes={data.lessonTypes}
					vocabularyTypes={data.vocabularyTypes}
					titlePlaceholder="Lesson title"
				/>

				<div class="form-actions">
					<button type="submit">Save lesson</button>
					<button type="button" class="secondary-button" onclick={() => (showLessonEdit = false)}>
						Cancel
					</button>
				</div>
			</form>
		{/if}
	</section>

	{#if data.storyWordCoverage}
		<WordCoveragePanel title="Word coverage" entries={data.storyWordCoverage} />
	{/if}

	{#if data.lesson.type === 'STORY'}
		<section class="content-card">
			<div class="table-header story-grid">
				<span>Speaker</span>
				<span>Text</span>
				<span>Translation</span>
			</div>

			{#if !data.lesson.story || storySentences.length === 0}
				<p>No story sentences yet.</p>
			{:else}
				{#each storySentences as sentence}
					<div class="table-row story-grid">
						<div>
							{#if inlineStoryEdit?.sentenceId === sentence.id && inlineStoryEdit.field === 'speaker'}
								<input
									bind:this={inlineStoryInput}
									class="inline-edit-input"
									bind:value={inlineStoryValue}
									onkeydown={handleInlineStoryKeydown}
									onblur={saveInlineStoryEditOnBlur}
								/>
							{:else}
								<button
									type="button"
									class="inline-edit-button"
									onclick={() => beginInlineStoryEdit(sentence, 'speaker')}
								>
									{sentence.speaker ?? '—'}
								</button>
							{/if}
						</div>
						<div class="story-text-cell">
							<SentenceTokenAnnotations
								entityId={sentence.id}
								entityIdField="storySentenceId"
								entityKind="story"
								sentenceId={sentence.id}
								sentenceText={sentence.kalenjin}
								tokens={sentence.tokens}
								dictionaryWords={data.words}
								updateAction="?/updateStorySentenceToken"
								createAction="?/createStorySentenceWord"
								searchEndpoint={`/lessons/${data.lesson.id}/word-search`}
								tokenGroupEndpoint={`/lessons/${data.lesson.id}/token-groups`}
							/>
						</div>
						<div class="translation-cell">
							{#if inlineStoryEdit?.sentenceId === sentence.id && inlineStoryEdit.field === 'english'}
								<textarea
									bind:this={inlineStoryInput}
									class="inline-edit-input inline-edit-input--wide inline-translation-input"
									bind:value={inlineStoryValue}
									rows="2"
									onkeydown={handleInlineStoryKeydown}
									onblur={saveInlineStoryEditOnBlur}
								></textarea>
							{:else}
								<button
									type="button"
									class="inline-edit-button inline-edit-button--wide"
									onclick={() => beginInlineStoryEdit(sentence, 'english')}
								>
									{sentence.english}
								</button>
							{/if}

							<div class="sentence-notes">
								<small>Cultural / grammar notes</small>

								{#if inlineStoryEdit?.sentenceId === sentence.id && inlineStoryEdit.field === 'grammarNotes'}
									<textarea
										bind:this={inlineStoryInput}
										class="inline-edit-input inline-notes-input"
										bind:value={inlineStoryValue}
										rows="3"
										onkeydown={handleInlineStoryNotesKeydown}
									></textarea>
									<div class="inline-actions compact-actions">
										<button type="button" onclick={() => void saveInlineStoryEdit()}>Save notes</button>
										<button type="button" class="secondary-button" onclick={cancelInlineStoryEdit}>
											Cancel
										</button>
									</div>
								{:else}
									<button
										type="button"
										class="inline-edit-button inline-edit-button--wide notes-button"
										class:notes-button--empty={!sentence.grammarNotes}
										onclick={() => beginInlineStoryEdit(sentence, 'grammarNotes')}
									>
										{sentence.grammarNotes || 'Add notes'}
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/each}

			{#if inlineStoryError}
				<p class="error-text">{inlineStoryError}</p>
			{/if}
		{/if}
		</section>
	{:else}
		{#if data.vocabWordCoverage}
			<WordCoveragePanel
				title="Next story coverage"
				entries={data.vocabWordCoverage.words}
				storyLesson={data.vocabWordCoverage.storyLesson}
				quickAddAction="?/quickAddWord"
			/>
		{/if}

		<section class="content-card">
			<div class="card-header">
				<strong>Lesson words</strong>
				{#if flattenedLessonWords.length > 0}
					<span class="section-word-counts">
						{#if displaySections.length === 1}
							{flattenedLessonWords.length} word{flattenedLessonWords.length === 1 ? '' : 's'}
						{:else}
							{#each displaySections as section, i}{#if i > 0}<span class="section-sep">·</span>{/if}S{section.sectionNumber}: {section.items.length}{/each}
						{/if}
					</span>
				{/if}
				<button type="button" class="secondary-button" onclick={toggleAddWordForm}>
					{showAddWordForm ? 'Close' : 'Add word'}
				</button>
			</div>

			{#if showAddWordForm}
				<form method="POST" action="?/createWord" class="editor-form compact-form" use:enhance={enhanceAddWordForm}>
					<input type="hidden" name="lessonId" value={data.lesson.id} />

					<div class="two-column-grid">
						<label>
							Word
							<input name="kalenjin" required autocomplete="off" />
						</label>

						<label>
							Translation
							<input name="translations" required placeholder="comma-separated translations" />
						</label>
					</div>

					<button type="submit">Create lesson word</button>
				</form>
			{/if}

			{#if flattenedLessonWords.length === 0}
				<p>No lesson words yet.</p>
			{:else}
				{#each displaySections as section}
					<div class="section-divider">
						<hr />
						<span>Section {section.sectionNumber}</span>
					</div>

					<div class="table-header vocab-grid">
						<span>Word</span>
						<span>Sentence</span>
						<span>Word for word</span>
						<span></span>
					</div>

					{#each section.items as lessonWord}
						{@const lwLocal = getLessonWordLocal(lessonWord)}
						<div class="table-row vocab-grid">
							<div class="word-cell">
								{#if inlineWordEdit?.lessonWordId === lessonWord.id && inlineWordEdit.field === 'kalenjin'}
									<input bind:this={inlineWordInput} class="inline-edit-input word-inline-input word-kalenjin-input" bind:value={inlineWordValue} onkeydown={handleInlineWordKeydown} onblur={() => void saveInlineWordEdit()} />
								{:else}
									<button type="button" class="inline-edit-button word-kalenjin" onclick={() => beginInlineWordEdit(lessonWord, 'kalenjin')}>{getWordLocal(lessonWord).kalenjin}</button>
								{/if}
								{#if inlineWordEdit?.lessonWordId === lessonWord.id && inlineWordEdit.field === 'translations'}
									<input bind:this={inlineWordInput} class="inline-edit-input word-inline-input word-translations-input" bind:value={inlineWordValue} onkeydown={handleInlineWordKeydown} onblur={() => void saveInlineWordEdit()} />
								{:else}
									<button type="button" class="inline-edit-button word-translations" onclick={() => beginInlineWordEdit(lessonWord, 'translations')}>{getWordLocal(lessonWord).translations}</button>
								{/if}
								{#if inlineWordError && inlineWordEdit?.lessonWordId === lessonWord.id}
									<p class="error-text">{inlineWordError}</p>
								{/if}
							</div>
							<div class="sentence-cell">
								{#if inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'sentenceKalenjin'}
									<textarea bind:this={inlineLessonWordInput} class="inline-edit-input" rows="2" bind:value={inlineLessonWordValue} onkeydown={handleInlineLessonWordLineKeydown} onblur={() => void saveInlineLessonWordEdit()}></textarea>
								{:else}
									<button type="button" class="inline-edit-button" class:sentence-notes-empty={!lwLocal.sentenceKalenjin} onclick={() => beginInlineLessonWordEdit(lessonWord, 'sentenceKalenjin')}>{lwLocal.sentenceKalenjin || 'Add sentence'}</button>
								{/if}
								{#if inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'sentenceEnglish'}
									<textarea bind:this={inlineLessonWordInput} class="inline-edit-input sentence-english-input" rows="2" bind:value={inlineLessonWordValue} onkeydown={handleInlineLessonWordLineKeydown} onblur={() => void saveInlineLessonWordEdit()}></textarea>
								{:else}
									<button type="button" class="inline-edit-button sentence-english-text" class:sentence-notes-empty={!lwLocal.sentenceEnglish} onclick={() => beginInlineLessonWordEdit(lessonWord, 'sentenceEnglish')}>{lwLocal.sentenceEnglish || 'Add translation'}</button>
								{/if}
								{#if inlineLessonWordError && inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field !== 'notesMarkdown'}
									<p class="error-text">{inlineLessonWordError}</p>
								{/if}
							</div>
							<div class="word-for-word-cell">
								<SentenceTokenAnnotations
									entityId={lessonWord.id}
									entityIdField="lessonWordId"
									entityKind="example"
									sentenceId={lessonWord.sentence.id}
									sentenceText={lessonWord.sentence.kalenjin}
									tokens={lessonWord.sentence.tokens}
									dictionaryWords={data.words}
									updateAction="?/updateExampleSentenceToken"
									createAction="?/createExampleSentenceWord"
									searchEndpoint={`/lessons/${data.lesson.id}/word-search`}
									tokenGroupEndpoint={`/lessons/${data.lesson.id}/token-groups`}
								/>
							</div>
							<div class="row-action">
								<form method="POST" action="?/deleteWord" class="inline-delete">
									<input type="hidden" name="id" value={lessonWord.id} />
									<button type="submit" class="secondary-button">Delete</button>
								</form>
							</div>
							<div class="notes-cell">
								{#if inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'notesMarkdown'}
									<textarea bind:this={inlineLessonWordInput} class="inline-edit-input sentence-notes-input" rows="3" bind:value={inlineLessonWordValue} onkeydown={handleInlineLessonWordKeydown}></textarea>
									<div class="inline-actions compact-actions">
										<button type="button" onclick={() => void saveInlineLessonWordEdit()}>Save notes</button>
										<button type="button" class="secondary-button" onclick={cancelInlineLessonWordEdit}>Cancel</button>
									</div>
								{:else}
									<button type="button" class="inline-edit-button sentence-notes-text" class:sentence-notes-empty={!lwLocal.notesMarkdown} onclick={() => beginInlineLessonWordEdit(lessonWord, 'notesMarkdown')}>{lwLocal.notesMarkdown || 'Add notes'}</button>
								{/if}
								{#if inlineLessonWordError && inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'notesMarkdown'}
									<p class="error-text">{inlineLessonWordError}</p>
								{/if}
							</div>
						</div>

						{@const cefrCovered = getCefrCoveredTargets(lessonWord)}
						{@const cefrSuggestions = getCefrSuggestions(lessonWord)}
						{@const cefrResults = getCefrSearchResults(lessonWord)}
						<div class="cefr-row">
							<span class="cefr-label">CEFR</span>
							<div class="cefr-pills">
								{#each cefrCovered as target}
									<span class="cefr-pill cefr-pill--covered">
										<span class="cefr-pill-level">{target.level}</span>
										{target.english}
										<button
											type="button"
											class="cefr-pill-btn"
											aria-label={`Remove ${target.level} ${target.english}`}
											title="Remove"
											onclick={() => void removeCefrTarget(lessonWord.id, target.id)}
										>
											×
										</button>
									</span>
								{/each}

								{#each cefrSuggestions as suggestion}
									<span class="cefr-pill cefr-pill--suggest">
										<span class="cefr-pill-level">{suggestion.level}</span>
										{suggestion.english}
										<button
											type="button"
											class="cefr-pill-btn cefr-pill-btn--confirm"
											aria-label={`Confirm ${suggestion.level} ${suggestion.english}`}
											title="Confirm"
											onclick={() => void addCefrTarget(lessonWord.id, suggestion.id)}
										>
											✓
										</button>
										<button
											type="button"
											class="cefr-pill-btn"
											aria-label={`Dismiss ${suggestion.level} ${suggestion.english}`}
											title="Dismiss"
											onclick={() => dismissCefrSuggestion(lessonWord.id, suggestion.id)}
										>
											×
										</button>
									</span>
								{/each}

								<div class="cefr-search-wrap">
									<input
										type="text"
										class="cefr-search-input"
										placeholder="Search CEFR words..."
										value={cefrSearchQuery.get(lessonWord.id) ?? ''}
										autocomplete="off"
										oninput={(e) => {
											cefrSearchQuery = new Map(cefrSearchQuery).set(lessonWord.id, e.currentTarget.value);
											cefrSearchOpen = new Map(cefrSearchOpen).set(lessonWord.id, true);
										}}
										onfocus={() => {
											cefrSearchOpen = new Map(cefrSearchOpen).set(lessonWord.id, true);
										}}
										onblur={() =>
											window.setTimeout(() => {
												cefrSearchOpen = new Map(cefrSearchOpen).set(lessonWord.id, false);
											}, 150)}
									/>
									{#if cefrSearchOpen.get(lessonWord.id) && cefrResults.length > 0}
										<ul class="cefr-search-dropdown">
											{#each cefrResults as result}
												{@const resultUsed = isCefrTargetUsedByAnotherWord(result, lessonWord.id)}
												<li>
													<button
														type="button"
														class:cefr-search-result--used={resultUsed}
														disabled={resultUsed}
														title={resultUsed ? 'Already attached to another lesson word' : undefined}
														onmousedown={(event) => {
															event.preventDefault();
															if (resultUsed) return;
															void addCefrTarget(lessonWord.id, result.id);
															resetCefrSearch(lessonWord.id);
														}}
													>
														<span class="cefr-pill-level">{result.level}</span>
														<span class="cefr-search-result-text">{result.english}</span>
														{#if resultUsed}
															<span class="cefr-search-result-note">used</span>
														{/if}
													</button>
												</li>
											{/each}
										</ul>
									{/if}
								</div>
							</div>
						</div>

					{/each}
				{/each}
			{/if}
		</section>
	{/if}
</section>

<style>
	.lesson-page {
		display: grid;
		gap: 1rem;
	}

	.page-header {
		align-items: start;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}

	h1 {
		margin-bottom: 0.35rem;
	}

	.summary-line {
		color: #555;
		margin: 0;
	}

	.summary-card,
	.content-card {
		border: 1px solid #e2e2e2;
		padding: 1rem;
	}

	.card-header {
		align-items: center;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}

	.section-word-counts {
		align-items: center;
		color: #777;
		display: flex;
		font-size: 0.9rem;
		margin-right: auto;
	}

	.section-sep {
		margin: 0 0.5rem;
	}

	.error {
		color: #8c1c13;
		font-weight: 600;
	}

	.success {
		color: #1a7f37;
		font-weight: 600;
	}

	.error-text {
		color: #8c1c13;
		font-weight: 600;
	}

	.editor-form {
		display: grid;
		gap: 0.75rem;
	}

	.compact-form {
		max-width: 980px;
	}

	.table-header,
	.table-row {
		align-items: start;
		border-top: 1px solid #eee;
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem 0;
	}

	.table-header {
		border-top: 0;
		color: #555;
		font-size: 0.95rem;
		font-weight: 600;
		padding-top: 0;
	}

	.story-grid {
		grid-template-columns: 120px minmax(0, 2fr) minmax(0, 2fr);
	}

	.story-text-cell {
		min-width: 0;
	}

	.translation-cell {
		display: grid;
		gap: 0.45rem;
		min-width: 0;
	}

	.sentence-notes {
		border-top: 1px solid #eee;
		display: grid;
		gap: 0.3rem;
		padding-top: 0.45rem;
	}

	.sentence-notes small {
		color: #666;
		font-weight: 600;
	}

	.notes-button {
		color: #444;
		white-space: pre-wrap;
	}

	.notes-button--empty {
		color: #9a9a9a;
	}

	.inline-notes-input {
		min-height: 4.5rem;
		resize: vertical;
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
		grid-template-columns: minmax(150px, 0.9fr) minmax(0, 1.4fr) minmax(300px, 2fr) auto;
	}

	.word-cell {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.word-kalenjin {
		font-weight: 600;
	}

	.word-translations {
		color: #555;
		font-size: 0.9rem;
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
		border-bottom-color: #aaa;
	}


	.word-translations-input {
		color: #555;
		font-size: 0.9rem;
	}

	.sentence-cell {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.word-for-word-cell {
		min-width: 0;
	}

	.notes-cell {
		border-top: 1px solid #eee;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		grid-column: 2 / 4;
		min-width: 0;
		padding-top: 0.55rem;
	}

	.sentence-english-text {
		color: #555;
		font-style: italic;
	}

	.sentence-english-input {
		font-style: italic;
	}

	.sentence-notes-text {
		color: #444;
		white-space: pre-wrap;
	}

	.sentence-notes-empty {
		color: #9a9a9a;
	}

	.row-action {
		align-items: start;
		display: flex;
		gap: 0.4rem;
		justify-content: end;
	}

	.cefr-row {
		align-items: start;
		display: grid;
		gap: 0.6rem;
		grid-template-columns: auto minmax(0, 1fr);
		padding: 0 0 0.5rem;
	}

	.cefr-label {
		color: #555;
		font-size: 0.85rem;
		font-weight: 600;
		padding-top: 0.3rem;
		white-space: nowrap;
	}

	.cefr-pills {
		align-items: center;
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		gap: 0.35rem;
		min-width: 0;
	}

	.cefr-pill {
		align-items: center;
		background: #fff7ed;
		border: 1px solid #fed7aa;
		border-radius: 3px;
		color: inherit;
		display: inline-flex;
		flex: 0 1 auto;
		font-size: 0.85rem;
		gap: 0.3rem;
		line-height: 1.2;
		max-width: 100%;
		min-width: 0;
		overflow-wrap: anywhere;
		padding: 0.2rem 0.35rem 0.2rem 0.45rem;
	}

	.cefr-pill--covered:hover {
		border-color: #c08457;
	}

	.cefr-pill--suggest {
		background: #eff6ff;
		border-color: #bfdbfe;
		border-style: dashed;
	}

	.cefr-pill-level {
		color: #555;
		font-weight: 600;
	}

	.cefr-pill-btn {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: 2px;
		color: #666;
		cursor: pointer;
		display: inline-flex;
		font-size: 0.85rem;
		height: 1.25rem;
		justify-content: center;
		line-height: 1;
		margin-left: 0.05rem;
		padding: 0;
		width: 1.25rem;
	}

	.cefr-pill-btn:hover {
		background: rgba(0, 0, 0, 0.07);
		color: #111;
	}

	.cefr-pill-btn--confirm {
		color: #166534;
	}

	.cefr-search-wrap {
		min-width: 12rem;
		position: relative;
	}

	.cefr-search-input {
		border: 1px solid #d0d0d0;
		box-sizing: border-box;
		font-size: 0.85rem;
		padding: 0.25rem 0.45rem;
		width: 100%;
	}

	.cefr-search-dropdown {
		background: #fff;
		border: 1px solid #ccc;
		list-style: none;
		margin: 0.2rem 0 0;
		max-height: 12rem;
		overflow-y: auto;
		padding: 0;
		position: absolute;
		width: min(22rem, 80vw);
		z-index: 10;
	}

	.cefr-search-dropdown li button {
		align-items: center;
		background: transparent;
		border: 0;
		cursor: pointer;
		display: flex;
		gap: 0.45rem;
		padding: 0.4rem 0.55rem;
		text-align: left;
		width: 100%;
	}

	.cefr-search-dropdown li button:hover {
		background: #f0f0f0;
	}

	.cefr-search-dropdown li button:disabled {
		color: #777;
		cursor: not-allowed;
	}

	.cefr-search-dropdown li button:disabled:hover {
		background: transparent;
	}

	.cefr-search-result--used .cefr-search-result-text {
		text-decoration: line-through;
	}

	.cefr-search-result-note {
		color: #777;
		font-size: 0.8rem;
		margin-left: auto;
	}

	label {
		display: grid;
		gap: 0.25rem;
	}

	input,
	textarea,
	button {
		font: inherit;
		padding: 0.45rem 0.5rem;
	}

	.form-actions,
	.inline-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.inline-delete {
		margin: 0;
	}

	.secondary-button {
		background: #fff;
		border: 1px solid #d0d0d0;
	}

	.inline-edit-button {
		background: transparent;
		border: 0;
		cursor: text;
		font: inherit;
		padding: 0;
		text-align: left;
	}

	.inline-edit-button--wide {
		width: 100%;
	}

	.inline-edit-button.word-kalenjin {
		font-weight: 600;
	}

	.inline-edit-button.sentence-english-text {
		font-style: italic;
	}

	.inline-edit-input {
		font: inherit;
		padding: 0.2rem 0.3rem;
		width: 100%;
	}

	.inline-edit-input--wide {
		min-width: 16rem;
	}

	.two-column-grid {
		display: grid;
		gap: 0.75rem;
	}

	.section-divider {
		align-items: center;
		display: flex;
		gap: 0.75rem;
		margin: 1.75rem 0 0.75rem;
	}

	.section-divider hr {
		border: 0;
		border-top: 1px solid #ddd;
		flex: 1;
		margin: 0;
	}

	.section-divider span {
		color: #555;
		font-size: 0.95rem;
		font-weight: 600;
	}

	@media (min-width: 900px) {
		.two-column-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 800px) {
		.page-header,
		.card-header,
		.story-grid,
		.cefr-row,
		.vocab-grid {
			grid-template-columns: 1fr;
			display: grid;
		}

		.row-action {
			justify-content: start;
		}

		.notes-cell {
			grid-column: auto;
		}
	}

</style>
