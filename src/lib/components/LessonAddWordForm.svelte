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
			otherLessons?: { id: string; title: string }[];
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
		kalenjin: string;
		lessons: { id: string; title: string }[];
	} | null>(null);
	let confirmedDuplicateWordId = $state<string | null>(null);

	$effect(() => {
		const selectedId = addWordState.selectedWord?.id ?? null;
		if (confirmedDuplicateWordId && confirmedDuplicateWordId !== selectedId) {
			confirmedDuplicateWordId = null;
		}
	});

	function handleAddWordSubmit(event: SubmitEvent) {
		const selected = addWordState.selectedWord;
		if (!selected || !selected.otherLessons?.length) return;
		if (confirmedDuplicateWordId === selected.id) return;
		event.preventDefault();
		pendingDuplicateWord = {
			form: event.currentTarget as HTMLFormElement,
			kalenjin: selected.kalenjin,
			lessons: selected.otherLessons
		};
	}

	function confirmPendingDuplicate() {
		if (!pendingDuplicateWord) return;
		const selected = addWordState.selectedWord;
		const form = pendingDuplicateWord.form;
		pendingDuplicateWord = null;
		if (selected) {
			confirmedDuplicateWordId = selected.id;
		}
		form.requestSubmit();
	}

	function cancelPendingDuplicate() {
		pendingDuplicateWord = null;
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
		onsubmit={handleAddWordSubmit}
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

		{#if addWordState.selectedWord?.otherLessons?.length}
			<div class="duplicate-warning" role="status">
				<strong>Already in another lesson.</strong>
				<span>
					"{addWordState.selectedWord.kalenjin}" is taught in
					{#each addWordState.selectedWord.otherLessons as lesson, index}
						<a href={`/lessons/${lesson.id}`} target="_blank" rel="noopener">{lesson.title}</a>{#if index < addWordState.selectedWord.otherLessons.length - 1}, {/if}
					{/each}.
				</span>
			</div>
		{/if}

		<div class="add-word-actions">
			<button type="submit" class="btn">
				{#if addWordState.selectedWord && addWordState.selectedWord.otherLessons?.length && confirmedDuplicateWordId !== addWordState.selectedWord.id}
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
	title="Word already in another lesson"
	message={pendingDuplicateWord
		? `"${pendingDuplicateWord.kalenjin}" is already taught in ${pendingDuplicateWord.lessons.map((l) => `"${l.title}"`).join(', ')}. Add it to this lesson anyway?`
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
		background: color-mix(in oklch, var(--warning, oklch(0.85 0.18 80)) 18%, var(--bg-raised));
		border: 1px solid color-mix(in oklch, var(--warning, oklch(0.85 0.18 80)) 45%, var(--line));
		border-radius: var(--radius);
		color: var(--ink);
		display: grid;
		font-size: 13px;
		gap: 4px;
		padding: 10px 14px;
	}

	.duplicate-warning a {
		color: var(--brand);
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
