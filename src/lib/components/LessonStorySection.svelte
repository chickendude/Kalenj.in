<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import AudioPlayButton from './AudioPlayButton.svelte';
	import SentenceTimeText from './SentenceTimeText.svelte';
	import SentenceTokenAnnotations from './SentenceTokenAnnotations.svelte';
	import type { ComponentProps } from 'svelte';
	import { splitSentenceText } from '$lib/story-split';

	type InlineStoryField = 'speaker' | 'english' | 'grammarNotes';
	type AnnotationsProps = ComponentProps<typeof SentenceTokenAnnotations>;

	type Sentence = {
		id: string;
		speaker: string | null;
		grammarNotes: string | null;
		exampleSentence: {
			id: string;
			english: string;
			kalenjin: string;
			audioUrl: string | null;
			tokens: AnnotationsProps['tokens'];
		};
	};

	let {
		lessonId,
		sentences,
		dictionaryWords,
		ignoredNormalizedForms
	}: {
		lessonId: string;
		sentences: Sentence[];
		dictionaryWords: AnnotationsProps['dictionaryWords'];
		ignoredNormalizedForms: string[];
	} = $props();

	let storySentences = $state<Sentence[]>([]);
	let lastIncomingSignature = $state('');

	let inlineStoryEdit = $state<{ sentenceId: string; field: InlineStoryField } | null>(null);
	let inlineStoryValue = $state('');
	let inlineStoryError = $state<string | null>(null);
	let inlineStoryInput = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let storyFocusRequests = $state<
		Record<string, { position: 'first' | 'last'; nonce: number }>
	>({});
	let storyFocusNonce = 0;
	let storyRowBusy = $state<string | null>(null);

	$effect(() => {
		const signature = sentences
			.map(
				(s) =>
					`${s.id}|${s.speaker ?? ''}|${s.exampleSentence.id}|${s.exampleSentence.english}|${s.exampleSentence.kalenjin}|${s.grammarNotes ?? ''}`
			)
			.join('');
		if (signature !== lastIncomingSignature) {
			storySentences = sentences.map((sentence) => ({
				...sentence,
				exampleSentence: { ...sentence.exampleSentence }
			}));
			lastIncomingSignature = signature;
		}
	});

	$effect(() => {
		if (!inlineStoryEdit) return;
		const timeout = window.setTimeout(() => {
			inlineStoryInput?.focus();
			inlineStoryInput?.select();
		}, 0);
		return () => window.clearTimeout(timeout);
	});

	function focusStorySentence(targetSentenceId: string, position: 'first' | 'last') {
		storyFocusNonce += 1;
		storyFocusRequests = {
			...storyFocusRequests,
			[targetSentenceId]: {
				position,
				nonce: storyFocusNonce
			}
		};
	}

	function beginInlineStoryEdit(sentence: Sentence, field: InlineStoryField) {
		inlineStoryEdit = { sentenceId: sentence.id, field };
		inlineStoryValue =
			field === 'speaker'
				? sentence.speaker ?? ''
				: field === 'grammarNotes'
					? sentence.grammarNotes ?? ''
					: sentence.exampleSentence.english;
		inlineStoryError = null;
	}

	function cancelInlineStoryEdit() {
		inlineStoryEdit = null;
		inlineStoryValue = '';
		inlineStoryError = null;
	}

	async function saveInlineStoryEdit() {
		if (!inlineStoryEdit) return;

		try {
			const response = await fetch(`/lessons/${lessonId}/story-sentence-inline`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					sentenceId: inlineStoryEdit.sentenceId,
					field: inlineStoryEdit.field,
					value: inlineStoryValue
				})
			});

			const result = (await response.json()) as {
				message?: string;
				sentence?: {
					id: string;
					speaker: string | null;
					english: string;
					grammarNotes: string | null;
				};
			};

			if (!response.ok || !result.sentence) {
				throw new Error(result.message ?? 'Could not save story field.');
			}

			storySentences = storySentences.map((sentence) =>
				sentence.id === result.sentence?.id
					? {
							...sentence,
							speaker: result.sentence.speaker,
							exampleSentence: {
								...sentence.exampleSentence,
								english: result.sentence.english
							},
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

	async function splitStorySentence(sentenceId: string) {
		if (storyRowBusy) return;
		storyRowBusy = sentenceId;
		inlineStoryError = null;
		try {
			const response = await fetch(`/lessons/${lessonId}/story-sentence-split`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ sentenceId })
			});
			const result = (await response.json()) as { message?: string };
			if (!response.ok) {
				throw new Error(result.message ?? 'Could not split sentence.');
			}
			await invalidateAll();
		} catch (err) {
			inlineStoryError = err instanceof Error ? err.message : 'Could not split sentence.';
		} finally {
			storyRowBusy = null;
		}
	}

	async function mergeStorySentence(sentenceId: string) {
		if (storyRowBusy) return;
		storyRowBusy = sentenceId;
		inlineStoryError = null;
		try {
			const response = await fetch(`/lessons/${lessonId}/story-sentence-merge`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ sentenceId })
			});
			const result = (await response.json()) as { message?: string };
			if (!response.ok) {
				throw new Error(result.message ?? 'Could not merge sentence.');
			}
			await invalidateAll();
		} catch (err) {
			inlineStoryError = err instanceof Error ? err.message : 'Could not merge sentence.';
		} finally {
			storyRowBusy = null;
		}
	}
</script>

<section class="content-card">
	<div class="table-header story-grid">
		<span>Speaker</span>
		<span>Text</span>
		<span></span>
		<span>Translation</span>
	</div>

	{#if storySentences.length === 0}
		<p>No story sentences yet.</p>
	{:else}
		{#each storySentences as sentence, sentenceIndex}
			{@const prev = sentenceIndex > 0 ? storySentences[sentenceIndex - 1] : null}
			{@const next =
				sentenceIndex < storySentences.length - 1
					? storySentences[sentenceIndex + 1]
					: null}
			{@const showSpeaker = !prev || prev.speaker !== sentence.speaker}
			{@const tokenSentence = sentence.exampleSentence}
			{@const canSplit = splitSentenceText(tokenSentence.kalenjin).length > 1}
			{@const canMerge = sentenceIndex < storySentences.length - 1}
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
							class:inline-edit-button--quiet={!showSpeaker}
							onclick={() => beginInlineStoryEdit(sentence, 'speaker')}
						>
							{showSpeaker ? (sentence.speaker ?? '—') : ''}
						</button>
					{/if}
				</div>
				<div class="story-text-cell">
					<AudioPlayButton
						audioUrl={tokenSentence.audioUrl}
						size="sm"
						label="Play sentence"
					/>
					<SentenceTokenAnnotations
						entityId={tokenSentence.id}
						entityIdField="sentenceId"
						entityKind="example"
						sentenceId={tokenSentence.id}
						sentenceText={tokenSentence.kalenjin}
						tokens={tokenSentence.tokens}
						{dictionaryWords}
						{ignoredNormalizedForms}
						updateAction={`/corpus/${tokenSentence.id}?/updateCorpusSentenceToken`}
						createAction={`/corpus/${tokenSentence.id}?/createCorpusSentenceWord`}
						searchEndpoint={`/corpus/${tokenSentence.id}/word-search`}
						tokenGroupEndpoint={`/corpus/${tokenSentence.id}/token-groups`}
						focusRequest={storyFocusRequests[sentence.id] ?? null}
						onNavigatePrevSentence={prev
							? () => focusStorySentence(prev.id, 'last')
							: undefined}
						onNavigateNextSentence={next
							? () => focusStorySentence(next.id, 'first')
							: undefined}
					/>
				</div>
				<div class="row-actions">
					{#if canSplit}
						<button
							type="button"
							class="row-action-icon"
							title="Split into separate sentences"
							aria-label="Split sentence"
							disabled={storyRowBusy === sentence.id}
							onclick={() => void splitStorySentence(sentence.id)}
						>
							<svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
								<circle
									cx="3.5"
									cy="4"
									r="1.8"
									fill="none"
									stroke="currentColor"
									stroke-width="1.3"
								/>
								<circle
									cx="3.5"
									cy="12"
									r="1.8"
									fill="none"
									stroke="currentColor"
									stroke-width="1.3"
								/>
								<path
									d="M5 5 L14 11 M5 11 L14 5"
									stroke="currentColor"
									stroke-width="1.3"
									stroke-linecap="round"
									fill="none"
								/>
							</svg>
						</button>
					{/if}
					{#if canMerge}
						<button
							type="button"
							class="row-action-icon"
							title="Merge with next sentence"
							aria-label="Merge with next sentence"
							disabled={storyRowBusy === sentence.id}
							onclick={() => void mergeStorySentence(sentence.id)}
						>
							<svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
								<circle cx="3.5" cy="3" r="1.6" />
								<circle cx="12.5" cy="3" r="1.6" />
								<circle cx="8" cy="13" r="1.6" />
								<path
									d="M3.5 4.6 L8 8.5 M12.5 4.6 L8 8.5 M8 8.5 V11.4"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									fill="none"
								/>
							</svg>
						</button>
					{/if}
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
							<SentenceTimeText text={sentence.exampleSentence.english} />
						</button>
					{/if}

					<div class="sentence-notes">
						<div class="notes-label">Cultural / grammar notes</div>

						{#if inlineStoryEdit?.sentenceId === sentence.id && inlineStoryEdit.field === 'grammarNotes'}
							<textarea
								bind:this={inlineStoryInput}
								class="inline-edit-input inline-notes-input"
								bind:value={inlineStoryValue}
								rows="3"
								onkeydown={handleInlineStoryNotesKeydown}
							></textarea>
							<div class="inline-actions compact-actions">
								<button type="button" class="btn btn-sm" onclick={() => void saveInlineStoryEdit()}
									>Save notes</button
								>
								<button type="button" class="btn ghost btn-sm" onclick={cancelInlineStoryEdit}>
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

<style>
	.content-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 1rem 1.25rem;
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

	.story-grid {
		grid-template-columns: 120px minmax(0, 2fr) 1.75rem minmax(0, 2fr);
	}

	.story-text-cell {
		align-items: baseline;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		min-width: 0;
	}

	.translation-cell {
		display: grid;
		gap: 0.45rem;
		min-width: 0;
	}

	.row-actions {
		align-items: center;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		justify-content: center;
	}

	.row-action-icon {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: var(--radius);
		color: var(--ink-mute);
		cursor: pointer;
		display: inline-flex;
		height: 1.5rem;
		justify-content: center;
		padding: 0;
		width: 1.5rem;
	}

	.row-action-icon:hover:not(:disabled),
	.row-action-icon:focus-visible {
		background: var(--surface);
		color: var(--ink);
	}

	.row-action-icon:disabled {
		cursor: default;
		opacity: 0.4;
	}

	.row-action-icon svg {
		fill: currentColor;
		height: 0.95rem;
		width: 0.95rem;
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

	.inline-edit-button--quiet {
		color: var(--ink-mute);
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

	.inline-edit-input--wide {
		min-width: 16rem;
	}

	.inline-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.compact-actions {
		gap: 0.45rem;
	}

	.sentence-notes {
		border-top: 1px solid var(--line-soft);
		display: grid;
		gap: 0.3rem;
		padding-top: 0.45rem;
	}

	.notes-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.14em;
		margin-bottom: 2px;
		text-transform: uppercase;
	}

	.notes-button {
		color: var(--ink-soft);
		font-size: 13px;
		line-height: 1.45;
		white-space: pre-wrap;
	}

	.notes-button--empty {
		color: var(--ink-mute);
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

	.error-text {
		color: oklch(0.45 0.15 25);
		font-weight: 600;
	}

	@media (max-width: 800px) {
		.story-grid {
			display: grid;
			grid-template-columns: 1fr;
		}
	}
</style>
