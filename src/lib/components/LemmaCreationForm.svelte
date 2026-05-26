<script lang="ts">
	import { enhance } from '$app/forms';
	import { PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import { dictionaryEntryHref } from '$lib/word-url';
	import ImageUploadField from './ImageUploadField.svelte';
	import WordLinkEditor from './WordLinkEditor.svelte';
	import type { PartOfSpeech } from '@prisma/client';
	import type { ActionResult } from '@sveltejs/kit';

	const CORE_POS = ['NOUN', 'ADJECTIVE', 'VERB'] as const satisfies readonly PartOfSpeech[];
	const OTHER_POS = [
		'ADVERB',
		'PRONOUN',
		'PREPOSITION',
		'CONJUNCTION',
		'INTERJECTION',
		'PHRASE',
		'OTHER'
	] as const satisfies readonly PartOfSpeech[];

	type Draft = {
		inContextTranslation: string;
		selectedWordId: string;
		createLemma: string;
		createTranslations: string;
		createNotes: string;
		createAlternativeSpellings: string;
		createPluralForm: string;
		createIsPluralOnly: boolean;
		createAlternativePluralForms: string;
		createPartOfSpeech: PartOfSpeech | '';
	};

	type EnhancedSubmitResult = ActionResult<
		Record<string, unknown> | undefined,
		Record<string, unknown> | undefined
	>;
	type EnhancedUpdate = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;
	type EnhanceHandler = (args: {
		result: EnhancedSubmitResult;
		update: EnhancedUpdate;
	}) => Promise<void>;

	let {
		createAction,
		updateAction,
		entityId,
		entityIdField,
		activeTokenId,
		activeSegmentId = null,
		activeWord,
		activeWordId,
		inContextTranslation,
		activeSurface,
		draft,
		createState,
		onDraftChange,
		onCreateEnhance,
		onClearEnhance,
		onCancel
	}: {
		createAction: string;
		updateAction: string;
		entityId: string;
		entityIdField: string;
		activeTokenId: string;
		activeSegmentId?: string | null;
		activeWord: { id: string; kalenjin: string; imageUrl?: string | null } | null;
		activeWordId: string | null;
		inContextTranslation: string;
		activeSurface: string;
		draft: Draft | undefined;
		createState: 'idle' | 'saving' | 'saved' | 'error';
		onDraftChange: <K extends keyof Draft>(field: K, value: Draft[K]) => void;
		onCreateEnhance: () => EnhanceHandler;
		onClearEnhance: () => EnhanceHandler;
		onCancel: () => void;
	} = $props();

	let posOtherOpen = $state(false);
	let posOtherWrap = $state<HTMLDivElement | null>(null);

	const createLemmaValue = $derived(draft?.createLemma ?? activeSurface ?? '');
	const createTranslationsValue = $derived(draft?.createTranslations ?? '');
	const selectedWordInDraft = $derived(draft?.selectedWordId ?? '');
	const canSubmitCreate = $derived(
		createLemmaValue.trim().length > 0 && createTranslationsValue.trim().length > 0
	);
	const currentPos = $derived(draft?.createPartOfSpeech ?? '');
	const otherSelected = $derived(
		currentPos !== '' && !(CORE_POS as readonly string[]).includes(currentPos)
	);
	const currentPosNeedsPlural = $derived(currentPos === 'NOUN' || currentPos === 'ADJECTIVE');
	const pluralFormValue = $derived(draft?.createPluralForm ?? '');
	const isPluralOnlyValue = $derived(draft?.createIsPluralOnly ?? false);

	$effect(() => {
		if (!posOtherOpen) return;

		function handlePointerDown(event: MouseEvent) {
			const wrap = posOtherWrap;
			if (!wrap) return;
			const target = event.target;
			if (target instanceof Node && wrap.contains(target)) return;
			posOtherOpen = false;
		}

		window.addEventListener('pointerdown', handlePointerDown, true);
		return () => window.removeEventListener('pointerdown', handlePointerDown, true);
	});
</script>

<div class="lemma-mode-row">
	<div class="pos-group">
		<span class="pos-group-label">Part of speech</span>
		<div class="pos-pills" role="radiogroup" aria-label="Part of speech">
			{#each CORE_POS as pos}
				{@const selected = currentPos === pos}
				<button
					type="button"
					role="radio"
					aria-checked={selected}
					class="pos-pill"
					class:selected
					onclick={() => {
						posOtherOpen = false;
						onDraftChange('createPartOfSpeech', selected ? '' : pos);
					}}
				>
					{PART_OF_SPEECH_LABELS[pos]}
				</button>
			{/each}
			<div class="pos-other-wrap" bind:this={posOtherWrap}>
				<button
					type="button"
					aria-pressed={otherSelected}
					aria-haspopup="menu"
					aria-expanded={posOtherOpen}
					class="pos-pill pos-pill-other"
					class:selected={otherSelected}
					onclick={() => {
						if (otherSelected) {
							onDraftChange('createPartOfSpeech', '');
							posOtherOpen = false;
						} else {
							posOtherOpen = !posOtherOpen;
						}
					}}
				>
					<span>
						{otherSelected
							? PART_OF_SPEECH_LABELS[currentPos as PartOfSpeech]
							: 'Other'}
					</span>
					<span class="pos-pill-caret" aria-hidden="true">▾</span>
				</button>
				{#if posOtherOpen}
					<div class="pos-other-menu" role="menu">
						{#each OTHER_POS as pos}
							{@const itemSelected = currentPos === pos}
							<button
								type="button"
								role="menuitemradio"
								aria-checked={itemSelected}
								class="pos-other-item"
								class:selected={itemSelected}
								onclick={() => {
									onDraftChange('createPartOfSpeech', itemSelected ? '' : pos);
									posOtherOpen = false;
								}}
							>
								{PART_OF_SPEECH_LABELS[pos]}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
	<div class="lemma-mode-side">
		{#if activeWord}
			<a
				href={dictionaryEntryHref(activeWord)}
				target="_blank"
				rel="noreferrer"
				class="lemma-sideling"
			>
				Open entry ↗
			</a>
		{/if}
		{#if activeWordId}
			<form
				method="POST"
				action={updateAction}
				use:enhance={onClearEnhance}
			>
				<input type="hidden" name={entityIdField} value={entityId} />
				<input type="hidden" name="tokenId" value={activeTokenId} />
				{#if activeSegmentId}
					<input type="hidden" name="segmentId" value={activeSegmentId} />
				{/if}
				<input type="hidden" name="wordId" value="" />
				<input
					type="hidden"
					name="inContextTranslation"
					value={inContextTranslation}
				/>
				<button type="submit" class="btn ghost sm">Clear lemma</button>
			</form>
		{/if}
	</div>
</div>

<form
	method="POST"
	action={createAction}
	class="lemma-form"
	enctype="multipart/form-data"
	use:enhance={onCreateEnhance}
>
	<input type="hidden" name={entityIdField} value={entityId} />
	<input type="hidden" name="tokenId" value={activeTokenId} />
	{#if activeSegmentId}
		<input type="hidden" name="segmentId" value={activeSegmentId} />
	{/if}
	<input type="hidden" name="wordId" value={selectedWordInDraft} />
	<input
		type="hidden"
		name="inContextTranslation"
		value={inContextTranslation}
	/>
	<input type="hidden" name="partOfSpeech" value={currentPos} />
	<input
		type="hidden"
		name="pluralForm"
		value={currentPosNeedsPlural && !isPluralOnlyValue ? pluralFormValue : ''}
	/>
	<input
		type="hidden"
		name="isPluralOnly"
		value={currentPosNeedsPlural && isPluralOnlyValue ? 'on' : ''}
	/>
	<input
		type="hidden"
		name="alternativePluralForms"
		value={currentPosNeedsPlural && !isPluralOnlyValue
			? draft?.createAlternativePluralForms ?? ''
			: ''}
	/>

	<div class="lemma-form-grid">
		<div class="field">
			<label for="lemma-field-kalenjin">Lemma</label>
			<input
				id="lemma-field-kalenjin"
				class="input"
				name="kalenjin"
				required
				value={createLemmaValue}
				oninput={(event) =>
					onDraftChange('createLemma', (event.currentTarget as HTMLInputElement).value)}
			/>
		</div>
		<div class="field">
			<label for="lemma-field-alt">Alternative spellings</label>
			<input
				id="lemma-field-alt"
				class="input"
				name="alternativeSpellings"
				placeholder="comma, separated"
				value={draft?.createAlternativeSpellings ?? ''}
				oninput={(event) =>
					onDraftChange(
						'createAlternativeSpellings',
						(event.currentTarget as HTMLInputElement).value
					)}
			/>
		</div>
	</div>

	{#if currentPosNeedsPlural}
		<div class="lemma-forms-block">
			<div class="lemma-forms-head">
				<span class="lemma-forms-label">Forms</span>
				<span class="lemma-forms-hint">
					{currentPos === 'NOUN'
						? 'Nouns need a plural form. Use commas for alternates.'
						: 'Adjectives need a plural form. Use commas for alternates.'}
				</span>
			</div>
			<div class="lemma-forms-grid">
				<div class="field">
					<label for="lemma-field-plural">Plural</label>
					<input
						id="lemma-field-plural"
						class="input"
						placeholder="e.g. chego"
						disabled={isPluralOnlyValue}
						value={pluralFormValue}
						oninput={(event) =>
							onDraftChange(
								'createPluralForm',
								(event.currentTarget as HTMLInputElement).value
							)}
					/>
				</div>
				<div class="field">
					<label for="lemma-field-plural-alt">Alternative plurals</label>
					<input
						id="lemma-field-plural-alt"
						class="input"
						placeholder="comma, separated"
						disabled={isPluralOnlyValue}
						value={draft?.createAlternativePluralForms ?? ''}
						oninput={(event) =>
							onDraftChange(
								'createAlternativePluralForms',
								(event.currentTarget as HTMLInputElement).value
							)}
					/>
				</div>
			</div>
			<label class="plural-only-toggle">
				<input
					type="checkbox"
					checked={isPluralOnlyValue}
					onchange={(event) =>
						onDraftChange(
							'createIsPluralOnly',
							(event.currentTarget as HTMLInputElement).checked
						)}
				/>
				<span>Plural-only</span>
			</label>
		</div>
	{/if}

	<div class="field lemma-full-field">
		<label for="lemma-field-translations">Translations</label>
		<input
			id="lemma-field-translations"
			class="input"
			name="translations"
			required
			placeholder="translation one; translation two"
			value={createTranslationsValue}
			oninput={(event) =>
				onDraftChange(
					'createTranslations',
					(event.currentTarget as HTMLInputElement).value
				)}
		/>
	</div>

	<div class="lemma-notes-image-grid">
		<div class="field notes-field">
			<label for="lemma-field-notes">Notes</label>
			<WordLinkEditor
				id="lemma-field-notes"
				name="notes"
				className="input notes-input"
				multiline
				rows={4}
				placeholder="Optional. Type [ to link another lemma."
				value={draft?.createNotes ?? ''}
				oninput={(next) => onDraftChange('createNotes', next)}
			/>
		</div>
		<ImageUploadField
			name="image"
			idPrefix="lemma-create-image"
			currentUrl={selectedWordInDraft && selectedWordInDraft === activeWord?.id
				? activeWord?.imageUrl ?? null
				: null}
		/>
	</div>

	<div class="lemma-modal-foot">
		<button type="button" class="btn ghost" onclick={onCancel}>Cancel</button>
		<button
			type="submit"
			class="btn"
			disabled={!canSubmitCreate || createState === 'saving'}
		>
			{#if createState === 'saving'}
				Saving…
			{:else if selectedWordInDraft}
				Update
			{:else}
				Create
			{/if}
		</button>
	</div>
</form>

<style>
	.lemma-mode-row {
		align-items: flex-end;
		border-bottom: 1px dotted var(--line);
		border-top: 1px dotted var(--line);
		display: flex;
		gap: 16px;
		justify-content: space-between;
		margin-bottom: 14px;
		padding: 12px 0;
	}
	.pos-group {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.pos-group-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.lemma-mode-side {
		align-items: center;
		display: flex;
		gap: 12px;
	}
	.lemma-mode-side form {
		margin: 0;
	}
	.lemma-sideling {
		color: var(--ink-soft);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.lemma-sideling:hover {
		color: var(--brand);
		text-decoration: none;
	}

	.lemma-form {
		display: block;
	}
	.lemma-form-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: 1fr 1fr;
	}
	.lemma-full-field {
		margin-top: 12px;
	}
	.lemma-notes-image-grid {
		align-items: stretch;
		display: grid;
		gap: 12px;
		grid-template-columns: 2fr 1fr;
		margin-top: 12px;
	}
	.lemma-notes-image-grid .notes-field {
		display: flex;
		flex-direction: column;
	}
	.lemma-notes-image-grid :global(.notes-input) {
		flex: 1;
		min-height: 0;
		resize: none;
		font-family: inherit;
	}
	.lemma-notes-image-grid .notes-field :global(.wle-wrap) {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 0;
	}
	.lemma-notes-image-grid :global(.image-upload) {
		height: 100%;
	}
	.lemma-notes-image-grid :global(.dropzone) {
		flex: 1;
	}
	.lemma-notes-image-grid :global(.dropzone.has-image) {
		padding: 0;
		overflow: hidden;
	}
	.lemma-notes-image-grid :global(.preview) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		object-fit: cover;
		border-radius: 5px;
	}
	.lemma-forms-block {
		background: color-mix(in oklch, var(--accent) 10%, var(--paper));
		border: 1px solid color-mix(in oklch, var(--accent) 32%, var(--line));
		border-radius: 12px;
		margin-top: 12px;
		padding: 14px 16px;
	}
	.lemma-forms-head {
		align-items: baseline;
		display: flex;
		gap: 12px;
		justify-content: space-between;
		margin-bottom: 10px;
	}
	.lemma-forms-label {
		color: var(--ink-soft);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.lemma-forms-hint {
		color: var(--ink-soft);
		font-size: 12px;
		font-style: italic;
	}
	.lemma-forms-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: 1fr 1fr;
	}
	.lemma-forms-grid .input:disabled {
		background: color-mix(in oklch, var(--ink-mute) 8%, var(--paper));
		color: var(--ink-mute);
		cursor: not-allowed;
	}
	.plural-only-toggle {
		align-items: center;
		color: var(--ink-soft);
		display: inline-flex;
		font-size: 13px;
		gap: 8px;
		margin-top: 10px;
	}
	.plural-only-toggle input {
		accent-color: var(--brand);
	}
	.pos-pills {
		display: flex;
		flex-wrap: nowrap;
		gap: 8px;
	}
	.pos-pill {
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: 10px;
		color: var(--ink);
		cursor: pointer;
		flex: 1 1 0;
		font-size: 14px;
		font-weight: 500;
		min-width: 0;
		padding: 10px 14px;
		text-align: center;
		transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
		white-space: nowrap;
	}
	.pos-pill:hover {
		background: color-mix(in oklch, var(--brand) 8%, var(--paper));
		border-color: color-mix(in oklch, var(--brand) 32%, var(--line));
	}
	.pos-pill.selected {
		background: var(--brand);
		border-color: var(--brand);
		color: var(--paper);
	}
	.pos-pill.selected:hover {
		background: var(--brand);
		border-color: var(--brand);
	}
	.pos-other-wrap {
		flex: 1 1 0;
		min-width: 0;
		position: relative;
	}
	.pos-other-wrap .pos-pill {
		align-items: center;
		display: flex;
		gap: 6px;
		justify-content: center;
		width: 100%;
	}
	.pos-pill-caret {
		font-size: 10px;
		line-height: 1;
		opacity: 0.7;
	}
	.pos-other-menu {
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: 10px;
		box-shadow: var(--shadow-md);
		display: flex;
		flex-direction: column;
		left: 0;
		min-width: 100%;
		overflow: hidden;
		position: absolute;
		top: calc(100% + 6px);
		width: max-content;
		z-index: 2;
	}
	.pos-other-item {
		background: transparent;
		border: 0;
		color: var(--ink);
		cursor: pointer;
		font-size: 13px;
		padding: 8px 12px;
		text-align: left;
		white-space: nowrap;
	}
	.pos-other-item:hover {
		background: color-mix(in oklch, var(--brand) 10%, transparent);
	}
	.pos-other-item.selected {
		background: color-mix(in oklch, var(--brand) 16%, transparent);
		color: var(--brand-ink);
		font-weight: 600;
	}

	.lemma-modal-foot {
		border-top: 1px solid var(--line-soft);
		display: flex;
		gap: 10px;
		justify-content: flex-end;
		margin-top: 20px;
		padding-top: 16px;
	}
	.lemma-modal-foot .btn {
		min-width: 140px;
	}
	.lemma-modal-foot .btn:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	@media (max-width: 720px) {
		.lemma-form-grid,
		.lemma-forms-grid,
		.lemma-notes-image-grid {
			grid-template-columns: 1fr;
		}
		.lemma-mode-row {
			align-items: stretch;
			flex-direction: column;
		}
		.lemma-mode-side {
			justify-content: flex-end;
		}
		.pos-pills {
			flex-wrap: wrap;
		}
	}
</style>
