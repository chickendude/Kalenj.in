<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import ImageUploadField from './ImageUploadField.svelte';
	import LemmaSearchPicker from './LemmaSearchPicker.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import type { PartOfSpeech } from '@prisma/client';

	type AddWordPickerState = {
		selectedWord: {
			id: string;
			kalenjin: string;
			translations: string;
			partOfSpeech?: PartOfSpeech | string | null;
			otherLessons?: {
				id: string;
				title: string;
				level?: string;
				lessonOrder?: number;
				timing?: 'earlier' | 'later' | 'other';
			}[];
		} | null;
		mode: 'search' | 'create';
		draftKalenjin: string;
		draftTranslations: string;
		draftAlternativeSpellings: string;
		draftNotes: string;
		draftPartOfSpeech: PartOfSpeech | '';
		draftPluralForm: string;
		draftIsPluralOnly: boolean;
		draftAlternativePluralForms: string;
		draftPresentAnee: string;
		draftPresentInyee: string;
		draftPresentInee: string;
		draftPresentEchek: string;
		draftPresentOkwek: string;
		draftPresentIchek: string;
		sentenceKalenjin: string;
		sentenceEnglish: string;
		error: string | null;
	};

	type EnhancedSubmitResult = ActionResult<
		Record<string, unknown> | undefined,
		Record<string, unknown> | undefined
	>;
	type EnhancedUpdate = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;

	function emptyAddWordState(): AddWordPickerState {
		return {
			selectedWord: null,
			mode: 'search',
			draftKalenjin: '',
			draftTranslations: '',
			draftAlternativeSpellings: '',
			draftNotes: '',
			draftPartOfSpeech: '',
			draftPluralForm: '',
			draftIsPluralOnly: false,
			draftAlternativePluralForms: '',
			draftPresentAnee: '',
			draftPresentInyee: '',
			draftPresentInee: '',
			draftPresentEchek: '',
			draftPresentOkwek: '',
			draftPresentIchek: '',
			sentenceKalenjin: '',
			sentenceEnglish: '',
			error: null
		};
	}

	let {
		lessonId,
		onSuccess
	}: {
		lessonId: string;
		onSuccess: () => void;
	} = $props();

	let addWordState = $state<AddWordPickerState>(emptyAddWordState());

	let pendingDuplicateWord = $state<{
		form: HTMLFormElement;
		wordId: string;
		kalenjin: string;
		lessons: NonNullable<NonNullable<AddWordPickerState['selectedWord']>['otherLessons']>;
	} | null>(null);
	let confirmedDuplicateWordId = $state<string | null>(null);

	$effect(() => {
		const selectedId = addWordState.selectedWord?.id ?? null;
		if (confirmedDuplicateWordId && confirmedDuplicateWordId !== selectedId) {
			confirmedDuplicateWordId = null;
		}
	});

	function confirmPendingDuplicate() {
		if (!pendingDuplicateWord) return;
		const { form, wordId } = pendingDuplicateWord;
		pendingDuplicateWord = null;
		confirmedDuplicateWordId = wordId;
		form.requestSubmit();
	}

	function cancelPendingDuplicate() {
		pendingDuplicateWord = null;
	}

	function enhanceAddWordForm({
		cancel,
		formElement
	}: {
		cancel: () => void;
		formElement: HTMLFormElement;
	}) {
		const selected = addWordState.selectedWord;
		const earlierLessons = selected?.otherLessons?.filter((lesson) => lesson.timing === 'earlier') ?? [];
		if (selected && earlierLessons.length > 0 && confirmedDuplicateWordId !== selected.id) {
			cancel();
			pendingDuplicateWord = {
				form: formElement,
				wordId: selected.id,
				kalenjin: selected.kalenjin,
				lessons: earlierLessons
			};
			return;
		}
		confirmedDuplicateWordId = null;
		return async ({
			result,
			update
		}: {
			result: EnhancedSubmitResult;
			update: EnhancedUpdate;
		}) => {
			if (result.type === 'success') {
				await update({ reset: false, invalidateAll: true });
				addWordState = emptyAddWordState();
				onSuccess();
				return;
			}
			if (result.type === 'failure') {
				const data = result.data;
				const message =
					data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
						? (data.error as string)
						: 'Could not create lesson word.';
				addWordState = { ...addWordState, error: message };
				return;
			}
			await applyAction(result);
		};
	}
</script>

<section class="card">
	<form
		method="POST"
		action="?/createWord"
		class="add-word-form"
		enctype="multipart/form-data"
		use:enhance={enhanceAddWordForm}
	>
		<input type="hidden" name="lessonId" value={lessonId} />

		<LemmaSearchPicker
			searchEndpoint={`/lessons/${lessonId}/word-search`}
			idPrefix="lesson-add-word"
			bind:selectedWord={addWordState.selectedWord}
			bind:mode={addWordState.mode}
			bind:draftKalenjin={addWordState.draftKalenjin}
			bind:draftTranslations={addWordState.draftTranslations}
			bind:draftAlternativeSpellings={addWordState.draftAlternativeSpellings}
			bind:draftNotes={addWordState.draftNotes}
			bind:draftPartOfSpeech={addWordState.draftPartOfSpeech}
			bind:draftPluralForm={addWordState.draftPluralForm}
			bind:draftIsPluralOnly={addWordState.draftIsPluralOnly}
			bind:draftAlternativePluralForms={addWordState.draftAlternativePluralForms}
			bind:draftPresentAnee={addWordState.draftPresentAnee}
			bind:draftPresentInyee={addWordState.draftPresentInyee}
			bind:draftPresentInee={addWordState.draftPresentInee}
			bind:draftPresentEchek={addWordState.draftPresentEchek}
			bind:draftPresentOkwek={addWordState.draftPresentOkwek}
			bind:draftPresentIchek={addWordState.draftPresentIchek}
		/>

		<div class="add-word-sentence">
			<label>
				Example sentence
				<textarea
					name="sentenceKalenjin"
					required
					rows="2"
					bind:value={addWordState.sentenceKalenjin}
				></textarea>
			</label>

			<label>
				Sentence translation
				<textarea
					name="sentenceEnglish"
					required
					rows="2"
					bind:value={addWordState.sentenceEnglish}
				></textarea>
			</label>
		</div>

		<div class="add-word-images">
			<ImageUploadField name="wordImage" idPrefix="add-word-image" label="Word image" />
			<ImageUploadField name="sentenceImage" idPrefix="add-sentence-image" label="Sentence image" />
		</div>

		{#if addWordState.error}
			<p class="error-text">{addWordState.error}</p>
		{/if}

		{#if addWordState.selectedWord?.otherLessons?.some((lesson) => lesson.timing === 'earlier')}
			{@const earlierLessons = addWordState.selectedWord.otherLessons.filter(
				(lesson) => lesson.timing === 'earlier'
			)}
			<div class="duplicate-warning" role="status">
				<span>
					"{addWordState.selectedWord.kalenjin}" is taught in
					{#each earlierLessons as lesson, index}
						<a href={`/lessons/${lesson.id}`} target="_blank" rel="noopener">{lesson.title}</a>{#if index < earlierLessons.length - 1}, {/if}
					{/each}.
				</span>
			</div>
		{/if}

		<div class="add-word-actions">
			<button type="submit" class="btn">
				{#if addWordState.selectedWord && addWordState.selectedWord.otherLessons?.some((lesson) => lesson.timing === 'earlier') && confirmedDuplicateWordId !== addWordState.selectedWord.id}
					Add "{addWordState.selectedWord.kalenjin}" anyway
				{:else if addWordState.selectedWord}
					Add "{addWordState.selectedWord.kalenjin}" to lesson
				{:else}
					Create lesson word
				{/if}
			</button>
		</div>
	</form>
</section>

<ConfirmDialog
	open={pendingDuplicateWord !== null}
	title="Word taught in another lesson"
	message={pendingDuplicateWord
		? `"${pendingDuplicateWord.kalenjin}" is taught in ${pendingDuplicateWord.lessons.map((l) => `"${l.title}"`).join(', ')}. Add it to this lesson anyway?`
		: ''}
	confirmLabel="Add anyway"
	onconfirm={confirmPendingDuplicate}
	oncancel={cancelPendingDuplicate}
/>

<style>
	.card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
	}

	.add-word-form {
		display: grid;
		gap: 16px;
		max-width: 980px;
	}

	.add-word-sentence {
		border-top: 1px dotted var(--line);
		display: grid;
		gap: 0.75rem;
		padding-top: 16px;
	}

	.add-word-sentence label {
		display: grid;
		gap: 4px;
	}

	.add-word-sentence textarea {
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: 8px;
		font: inherit;
		padding: 8px 10px;
	}

	.add-word-actions {
		display: flex;
		justify-content: flex-end;
	}

	.duplicate-warning {
		color: oklch(0.45 0.15 25);
		font-size: 13px;
		font-weight: 600;
	}

	.duplicate-warning a {
		color: var(--brand);
		font-weight: 600;
	}

	.add-word-images {
		border-top: 1px dotted var(--line);
		display: grid;
		gap: 16px;
		grid-template-columns: 1fr 1fr;
		padding-top: 16px;
	}

	.error-text {
		color: var(--danger);
		margin: 0;
	}

	@media (max-width: 640px) {
		.add-word-images {
			grid-template-columns: 1fr;
		}
	}
</style>
