<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import LessonFormFields from '$lib/components/LessonFormFields.svelte';
	import SentenceTokenAnnotations from '$lib/components/SentenceTokenAnnotations.svelte';
	import {
		formatLessonType,
		formatVocabularyLessonType,
		splitLessonItemsIntoSections
	} from '$lib/course';

	let { data, form } = $props();

	type LessonType = 'VOCABULARY' | 'STORY';
	type VocabularyType = '' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION';

	let showLessonEdit = $state(false);
	let showAddWordForm = $state(false);
	let editingStorySentenceId = $state<string | null>(null);
	let editingLessonWordId = $state<string | null>(null);

	let lessonTitle = $state('');
	let lessonType = $state<LessonType>('VOCABULARY');
	let lessonVocabularyType = $state<VocabularyType>('VOCAB');
	let lessonGrammarMarkdown = $state('');

	let cefrSaveState = $state<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
	type EnhancedSubmitResult = ActionResult<Record<string, unknown> | undefined, Record<string, unknown> | undefined>;
	type EnhancedUpdate = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;

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
		lessonGrammarMarkdown =
			data.lesson.type === 'STORY' ? data.storyImportText : (data.lesson.grammarMarkdown ?? '');
	});

	function isTargetSelected(
		targetId: string,
		selectedTargets: Array<{ id: string }>
	): boolean {
		return selectedTargets.some((target) => target.id === targetId);
	}

	function enhanceCefrForm(lessonWordId: string) {
		return () => {
			cefrSaveState[lessonWordId] = 'saving';

			return async ({
				result,
				update
			}: {
				result: EnhancedSubmitResult;
				update: EnhancedUpdate;
			}) => {
				if (result.type === 'success') {
					await update({ reset: false, invalidateAll: true });
					cefrSaveState[lessonWordId] = 'saved';
					window.setTimeout(() => {
						if (cefrSaveState[lessonWordId] === 'saved') {
							cefrSaveState[lessonWordId] = 'idle';
						}
					}, 1500);
					return;
				}

				cefrSaveState[lessonWordId] = 'error';
				await applyAction(result);
			};
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
	{:else if form?.updateWordSuccess}
		<p class="success">Saved lesson word.</p>
	{:else if form?.updateStorySentenceSuccess}
		<p class="success">Saved story sentence.</p>
	{:else if form?.updateWordCefrTargetsSuccess}
		<p class="success">Saved CEFR coverage.</p>
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

	{#if data.lesson.type === 'STORY'}
		<section class="content-card">
			<div class="table-header story-grid">
				<span>Speaker</span>
				<span>Text</span>
				<span>Translation</span>
				<span></span>
			</div>

			{#if !data.lesson.story || data.lesson.story.sentences.length === 0}
				<p>No story sentences yet.</p>
			{:else}
				{#each data.lesson.story.sentences as sentence}
					<div class="table-row story-grid">
						<div>{sentence.speaker ?? '—'}</div>
						<div class="story-text-cell">
							<SentenceTokenAnnotations
								entityId={sentence.id}
								entityIdField="storySentenceId"
								sentenceId={sentence.id}
								sentenceText={sentence.kalenjin}
								tokens={sentence.tokens}
								dictionaryWords={data.words}
								updateAction="?/updateStorySentenceToken"
								createAction="?/createStorySentenceWord"
								searchEndpoint={`/lessons/${data.lesson.id}/word-search`}
							/>
						</div>
						<div>{sentence.english}</div>
						<div class="row-action">
							<button
								type="button"
								class="secondary-button"
								onclick={() =>
									(editingStorySentenceId =
										editingStorySentenceId === sentence.id ? null : sentence.id)}
							>
								{editingStorySentenceId === sentence.id ? 'Close' : 'Edit'}
							</button>
						</div>
					</div>

					{#if editingStorySentenceId === sentence.id}
						<div class="expanded-panel">
							<form method="POST" action="?/updateStorySentence" class="editor-form compact-form">
								<input type="hidden" name="id" value={sentence.id} />

								<div class="three-column-grid">
									<label>
										Speaker
										<input name="speaker" value={sentence.speaker ?? ''} />
									</label>

									<label class="wide-field">
										Text
										<textarea name="kalenjin" rows="3" required>{sentence.kalenjin}</textarea>
									</label>

									<label class="wide-field">
										Translation
										<textarea name="english" rows="3" required>{sentence.english}</textarea>
									</label>
								</div>

								<label>
									Grammar / cultural notes
									<textarea name="grammarNotes" rows="3">{sentence.grammarNotes ?? ''}</textarea>
								</label>

								<button type="submit">Save sentence</button>
							</form>
						</div>
					{/if}
				{/each}
			{/if}
		</section>
	{:else}
		<section class="content-card">
			<div class="card-header">
				<strong>Lesson words</strong>
				<button type="button" class="secondary-button" onclick={() => (showAddWordForm = !showAddWordForm)}>
					{showAddWordForm ? 'Close' : 'Add word'}
				</button>
			</div>

			{#if showAddWordForm}
				<form method="POST" action="?/createWord" class="editor-form compact-form">
					<input type="hidden" name="lessonId" value={data.lesson.id} />

					<label>
						Word
						<select name="wordId" required>
							<option value="">Select...</option>
							{#each data.words as word}
								<option value={word.id}>{word.kalenjin} - {word.translations}</option>
							{/each}
						</select>
					</label>

					<div class="two-column-grid">
						<label>
							Sample sentence
							<textarea name="sentenceKalenjin" rows="3" required></textarea>
						</label>

						<label>
							Sentence translation
							<textarea name="sentenceEnglish" rows="3" required></textarea>
						</label>
					</div>

					<div class="two-column-grid">
						<label>
							Lesson translation
							<textarea name="sentenceTranslation" rows="2"></textarea>
						</label>

						<label>
							Word-for-word translation
							<textarea name="wordForWordTranslation" rows="2"></textarea>
						</label>
					</div>

					<label>
						Sentence notes
						<textarea name="notesMarkdown" rows="3"></textarea>
					</label>

					<label>
						Sentence source
						<input name="sentenceSource" />
					</label>

					<label>
						CEFR targets covered
						<select name="cefrTargetIds" multiple size="8">
							{#each data.cefrTargets as target}
								<option value={target.id} disabled={Boolean(target.coveredByLessonWordId)}>
									{target.level}: {target.english}
								</option>
							{/each}
						</select>
					</label>

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
						<span>Sample sentence</span>
						<span>Translation</span>
						<span></span>
					</div>

					{#each section.items as lessonWord}
						<div class="table-row vocab-grid">
							<div>{lessonWord.word.kalenjin}</div>
							<div>{lessonWord.sentence.kalenjin}</div>
							<div>{lessonWord.sentence.english}</div>
							<div class="row-action">
								<button
									type="button"
									class="secondary-button"
									onclick={() =>
										(editingLessonWordId =
											editingLessonWordId === lessonWord.id ? null : lessonWord.id)}
								>
									{editingLessonWordId === lessonWord.id ? 'Close' : 'Edit'}
								</button>
							</div>
						</div>

						{#if editingLessonWordId === lessonWord.id}
							<div class="expanded-panel">
								<form method="POST" action="?/updateWord" class="editor-form compact-form">
									<input type="hidden" name="id" value={lessonWord.id} />
									<input type="hidden" name="itemOrder" value={lessonWord.itemOrder} />

									<label>
										Word
										<select name="wordId" required value={lessonWord.wordId}>
											{#each data.words as word}
												<option value={word.id}>{word.kalenjin} - {word.translations}</option>
											{/each}
										</select>
									</label>

									<div class="two-column-grid">
										<label>
											Sample sentence
											<textarea name="sentenceKalenjin" rows="3" required>{lessonWord.sentence.kalenjin}</textarea>
										</label>

										<label>
											Sentence translation
											<textarea name="sentenceEnglish" rows="3" required>{lessonWord.sentence.english}</textarea>
										</label>
									</div>

									<div class="two-column-grid">
										<label>
											Lesson translation
											<textarea name="sentenceTranslation" rows="2">{lessonWord.sentenceTranslation ?? ''}</textarea>
										</label>

										<label>
											Word-for-word translation
											<textarea name="wordForWordTranslation" rows="2">{lessonWord.wordForWordTranslation ?? ''}</textarea>
										</label>
									</div>

									<label>
										Sentence notes
										<textarea name="notesMarkdown" rows="3">{lessonWord.notesMarkdown ?? ''}</textarea>
									</label>

									<label>
										Sentence source
										<input name="sentenceSource" value={lessonWord.sentence.source ?? ''} />
									</label>

									<button type="submit">Save lesson word</button>
								</form>

								<form method="POST" action="?/deleteWord" class="inline-delete">
									<input type="hidden" name="id" value={lessonWord.id} />
									<button type="submit">Delete</button>
								</form>

								<form
									method="POST"
									action="?/updateWordCefrTargets"
									class="editor-form compact-form"
									use:enhance={enhanceCefrForm(lessonWord.id)}
								>
									<input type="hidden" name="id" value={lessonWord.id} />

									<label>
										CEFR targets covered
										<select
											name="cefrTargetIds"
											multiple
											size="8"
											onchange={(event) => event.currentTarget.form?.requestSubmit()}
										>
											{#each data.cefrTargets as target}
												<option
													value={target.id}
													selected={isTargetSelected(target.id, lessonWord.coveredCefrTargets)}
													disabled={Boolean(
														target.coveredByLessonWordId &&
															target.coveredByLessonWordId !== lessonWord.id
													)}
												>
													{target.level}: {target.english}
												</option>
											{/each}
										</select>
									</label>

									<div class="inline-actions">
										<button type="submit" disabled={cefrSaveState[lessonWord.id] === 'saving'}>
											{cefrSaveState[lessonWord.id] === 'saving' ? 'Saving...' : 'Save CEFR'}
										</button>
										{#if cefrSaveState[lessonWord.id] === 'saved'}
											<span class="success-text">Saved.</span>
										{:else if cefrSaveState[lessonWord.id] === 'error'}
											<span class="error-text">Could not save.</span>
										{/if}
									</div>
								</form>

								<SentenceTokenAnnotations
									entityId={lessonWord.id}
									entityIdField="lessonWordId"
									sentenceId={lessonWord.sentence.id}
									sentenceText={lessonWord.sentence.kalenjin}
									tokens={lessonWord.sentence.tokens}
									dictionaryWords={data.words}
									updateAction="?/updateExampleSentenceToken"
									createAction="?/createExampleSentenceWord"
									searchEndpoint={`/lessons/${data.lesson.id}/word-search`}
								/>
							</div>
						{/if}
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

	.error {
		color: #8c1c13;
		font-weight: 600;
	}

	.success,
	.success-text {
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
		grid-template-columns: 120px minmax(0, 2fr) minmax(0, 2fr) auto;
	}

	.story-text-cell {
		min-width: 0;
	}

	.vocab-grid {
		grid-template-columns: 180px minmax(0, 2fr) minmax(0, 2fr) auto;
	}

	.row-action {
		display: flex;
		justify-content: end;
	}

	.expanded-panel {
		border-top: 1px dashed #ddd;
		display: grid;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		padding-top: 0.75rem;
	}

	label {
		display: grid;
		gap: 0.25rem;
	}

	input,
	textarea,
	select,
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

	.two-column-grid,
	.three-column-grid {
		display: grid;
		gap: 0.75rem;
	}

	.wide-field {
		grid-column: span 2;
	}

	.section-divider {
		align-items: center;
		display: flex;
		gap: 0.75rem;
		margin: 1rem 0 0.25rem;
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

		.three-column-grid {
			grid-template-columns: 180px minmax(0, 1fr) minmax(0, 1fr);
		}
	}

	@media (max-width: 800px) {
		.page-header,
		.card-header,
		.story-grid,
		.vocab-grid {
			grid-template-columns: 1fr;
			display: grid;
		}

		.row-action {
			justify-content: start;
		}
	}
</style>
