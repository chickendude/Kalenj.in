<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
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

		<div class="add-word-actions">
			<button type="submit" class="btn">
				{addWordState.selectedWord
					? `Add "${addWordState.selectedWord.kalenjin}" to lesson`
					: 'Create lesson word'}
			</button>
		</div>
	</form>
</section>

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
