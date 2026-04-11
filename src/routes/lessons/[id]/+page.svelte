<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import { formatLessonType, formatVocabularyLessonType } from '$lib/course';

	let { data, form } = $props();
	let cefrSaveState = $state<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
	type EnhancedSubmitResult = ActionResult<Record<string, unknown> | undefined, Record<string, unknown> | undefined>;
	type EnhancedUpdate = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;

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

	function contentFieldLabel() {
		return data.lesson.type === 'STORY' ? 'Story text' : 'Grammar markdown';
	}

	function contentFieldHint() {
		return data.lesson.type === 'STORY'
			? 'Use one line per sentence: Speaker: <tab> Kalenjin <tab> English.'
			: null;
	}
</script>

<section>
	<h1>{data.lesson.title}</h1>
	<p><a href="/lessons">Back to lessons</a></p>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{:else if form?.updateLessonSuccess}
		<p class="success">Saved lesson changes.</p>
	{:else if form?.createSectionSuccess}
		<p class="success">Created lesson section.</p>
	{:else if form?.updateSectionSuccess}
		<p class="success">Saved section changes.</p>
	{:else if form?.deleteSectionSuccess}
		<p class="success">Deleted section.</p>
	{:else if form?.createWordSuccess}
		<p class="success">Created lesson word.</p>
	{:else if form?.updateWordSuccess}
		<p class="success">Saved lesson word.</p>
	{:else if form?.updateWordCefrTargetsSuccess}
		<p class="success">Saved CEFR coverage.</p>
	{:else if form?.deleteWordSuccess}
		<p class="success">Deleted lesson word.</p>
	{/if}

	<form method="POST" action="?/updateLesson" class="editor-form">
		<h2>Lesson details</h2>

		<label>
			Level *
			<select name="level" value={data.lesson.level}>
				{#each data.levels as level}
					<option value={level}>{level}</option>
				{/each}
			</select>
		</label>

		<label>
			Title *
			<input name="title" required value={data.lesson.title} />
		</label>

		<label>
			Lesson order *
			<input name="lessonOrder" type="number" min="1" required value={data.lesson.lessonOrder} />
		</label>

		<label>
			Type *
			<select name="type" value={data.lesson.type}>
				{#each data.lessonTypes as type}
					<option value={type}>{formatLessonType(type)}</option>
				{/each}
			</select>
		</label>

		<label>
			Vocabulary type
			<select name="vocabularyType" value={data.lesson.vocabularyType ?? ''}>
				<option value="">Select...</option>
				{#each data.vocabularyTypes as type}
					<option value={type}>{formatVocabularyLessonType(type)}</option>
				{/each}
			</select>
		</label>

		<label>
			{contentFieldLabel()}
			<textarea name="grammarMarkdown" rows={data.lesson.type === 'STORY' ? 10 : 5}>{data.lesson.grammarMarkdown ?? ''}</textarea>
		</label>

		{#if contentFieldHint()}
			<p class="field-caption">{contentFieldHint()}</p>
		{/if}

		<button type="submit">Save lesson</button>
	</form>

	<form method="POST" action="?/deleteLesson" class="delete-form">
		<button type="submit">Delete lesson</button>
	</form>

	{#if data.lesson.type === 'VOCABULARY'}
		<section class="section-editor">
			<h2>Add section</h2>

			<form method="POST" action="?/createSection" class="editor-form">
				<label>
					Title
					<input name="title" />
				</label>

				<label>
					Section order *
					<input name="sectionOrder" type="number" min="1" required />
				</label>

				<label>
					Notes
					<textarea name="notes" rows="3"></textarea>
				</label>

				<button type="submit">Create section</button>
			</form>
		</section>

		{#if data.lesson.sections.length === 0}
			<p>No sections yet.</p>
		{:else}
			{#each data.lesson.sections as section}
				<section class="lesson-section">
					<h2>Section {section.sectionOrder}{section.title ? `: ${section.title}` : ''}</h2>

					<form method="POST" action="?/updateSection" class="editor-form">
						<input type="hidden" name="id" value={section.id} />

						<label>
							Title
							<input name="title" value={section.title ?? ''} />
						</label>

						<label>
							Section order *
							<input name="sectionOrder" type="number" min="1" required value={section.sectionOrder} />
						</label>

						<label>
							Notes
							<textarea name="notes" rows="3">{section.notes ?? ''}</textarea>
						</label>

						<button type="submit">Save section</button>
					</form>

					<form method="POST" action="?/deleteSection" class="delete-form">
						<input type="hidden" name="id" value={section.id} />
						<button type="submit">Delete section</button>
					</form>

					<h3>Add lesson word</h3>
					<form method="POST" action="?/createWord" class="editor-form lesson-word-form">
						<input type="hidden" name="lessonSectionId" value={section.id} />

						<label>
							Word *
											<select name="wordId" required>
												<option value="">Select...</option>
												{#each data.words as word}
													<option value={word.id}>{word.kalenjin} - {word.translations}</option>
												{/each}
											</select>
						</label>

						<label>
							Item order *
							<input name="itemOrder" type="number" min="1" required />
						</label>

						<label>
							Example sentence (Kalenjin) *
							<textarea name="sentenceKalenjin" rows="3" required></textarea>
						</label>

						<label>
							Example sentence (English) *
							<textarea name="sentenceEnglish" rows="3" required></textarea>
						</label>

						<label>
							Sentence source
							<input name="sentenceSource" />
						</label>

						<label>
							Lesson sentence translation
							<textarea name="sentenceTranslation" rows="2"></textarea>
						</label>

						<label>
							Word-for-word translation
							<textarea name="wordForWordTranslation" rows="2"></textarea>
						</label>

						<label>
							Notes
							<textarea name="notesMarkdown" rows="3"></textarea>
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

					<h3>Lesson words</h3>
					{#if section.words.length === 0}
						<p>No lesson words yet.</p>
					{:else}
						<ul class="word-list">
							{#each section.words as lessonWord}
								<li>
									<form method="POST" action="?/updateWord" class="editor-form lesson-word-form">
										<input type="hidden" name="id" value={lessonWord.id} />

										<label>
											Word *
											<select name="wordId" required value={lessonWord.wordId}>
												{#each data.words as word}
													<option value={word.id}>{word.kalenjin} - {word.translations}</option>
												{/each}
											</select>
										</label>

										<label>
											Item order *
											<input
												name="itemOrder"
												type="number"
												min="1"
												required
												value={lessonWord.itemOrder}
											/>
										</label>

										<label>
											Example sentence (Kalenjin) *
											<textarea name="sentenceKalenjin" rows="3" required>{lessonWord.sentence.kalenjin}</textarea>
										</label>

										<label>
											Example sentence (English) *
											<textarea name="sentenceEnglish" rows="3" required>{lessonWord.sentence.english}</textarea>
										</label>

										<label>
											Sentence source
											<input name="sentenceSource" value={lessonWord.sentence.source ?? ''} />
										</label>

										<label>
											Lesson sentence translation
											<textarea name="sentenceTranslation" rows="2">{lessonWord.sentenceTranslation ?? ''}</textarea>
										</label>

										<label>
											Word-for-word translation
											<textarea name="wordForWordTranslation" rows="2">{lessonWord.wordForWordTranslation ?? ''}</textarea>
										</label>

										<label>
											Notes
											<textarea name="notesMarkdown" rows="3">{lessonWord.notesMarkdown ?? ''}</textarea>
										</label>

										<button type="submit">Save lesson word</button>
									</form>

									<form
										method="POST"
										action="?/updateWordCefrTargets"
										class="editor-form lesson-word-form cefr-coverage-form"
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
											<small>Changes save in the background.</small>
										</label>

										<div class="inline-actions">
											<button type="submit" disabled={cefrSaveState[lessonWord.id] === 'saving'}>
												{cefrSaveState[lessonWord.id] === 'saving'
													? 'Saving...'
													: 'Save CEFR targets'}
											</button>
											{#if cefrSaveState[lessonWord.id] === 'saved'}
												<span class="inline-status success-text">Saved.</span>
											{:else if cefrSaveState[lessonWord.id] === 'error'}
												<span class="inline-status error-text">Could not save.</span>
											{/if}
										</div>
									</form>

									<form method="POST" action="?/deleteWord" class="delete-form">
										<input type="hidden" name="id" value={lessonWord.id} />
										<button type="submit">Delete lesson word</button>
									</form>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}
		{/if}
	{:else}
		<section class="story-summary">
			<h2>Story lesson</h2>
			{#if data.lesson.story}
				<p>Linked story: {data.lesson.story.title}</p>
				<p>{data.lesson.story.sentences.length} imported sentence(s).</p>
				{#if data.lesson.story.description}
					<p>{data.lesson.story.description}</p>
				{/if}
			{:else}
				<p>No story linked yet.</p>
			{/if}
		</section>
	{/if}
</section>

<style>
	.error {
		color: #8c1c13;
		font-weight: 600;
	}

	.success {
		color: #1a7f37;
		font-weight: 600;
	}

	.field-caption {
		color: #555;
		margin: 0;
	}

	.editor-form {
		display: grid;
		gap: 0.75rem;
		max-width: 820px;
	}

	.lesson-section,
	.section-editor,
	.story-summary {
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid #e2e2e2;
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

	.word-list {
		display: grid;
		gap: 1rem;
		padding: 0;
	}

	.word-list li {
		list-style: none;
		border: 1px solid #e2e2e2;
		padding: 1rem;
	}

	.lesson-word-form {
		max-width: 100%;
	}

	.delete-form {
		margin: 0.75rem 0 0;
	}

	.inline-actions {
		align-items: center;
		display: flex;
		gap: 0.75rem;
	}

	.inline-status {
		font-size: 0.95rem;
	}

	.success-text {
		color: #1a7f37;
	}

	.error-text {
		color: #8c1c13;
	}
</style>
