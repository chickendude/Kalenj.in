<script lang="ts">
	import { untrack } from 'svelte';
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import FormErrorFeedback from '$lib/components/FormErrorFeedback.svelte';
	import LemmaFormFields from '$lib/components/LemmaFormFields.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { dictionaryEntryHref } from '$lib/word-url';
	import type { PartOfSpeech, SentenceSuggestion, WordSuggestion } from '@prisma/client';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const dateFmt = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	function statusLabel(status: 'PENDING' | 'APPROVED' | 'REJECTED'): string {
		switch (status) {
			case 'PENDING':
				return 'Pending review';
			case 'APPROVED':
				return 'Approved';
			case 'REJECTED':
				return 'Declined';
		}
	}

	function statusClass(status: 'PENDING' | 'APPROVED' | 'REJECTED'): string {
		return `status-pill status-${status.toLowerCase()}`;
	}

	let wordOpen = $state(false);
	let sentenceOpen = $state(false);
	let wordSubmitting = $state(false);
	let sentenceSubmitting = $state(false);

	let wordError = $state<string | null>(null);
	let sentenceError = $state<string | null>(null);

	// When set, the modal is editing an existing pending suggestion instead of
	// creating a new one; the server treats `editingId` as the row to update.
	let wordEditingId = $state<string | null>(null);
	let sentenceEditingId = $state<string | null>(null);

	// Word form state
	let kalenjin = $state('');
	let translations = $state('');
	let alternativeSpellings = $state('');
	let notes = $state('');
	let partOfSpeech = $state<PartOfSpeech | ''>('');
	let pluralForm = $state('');
	let isPluralOnly = $state(false);
	let alternativePluralForms = $state('');
	let presentAnee = $state('');
	let presentInyee = $state('');
	let presentInee = $state('');
	let presentEchek = $state('');
	let presentOkwek = $state('');
	let presentIchek = $state('');

	// Sentence form state
	let sentenceKalenjin = $state('');
	let sentenceEnglish = $state('');
	let sentenceNotes = $state('');

	function resetWordForm() {
		kalenjin = '';
		translations = '';
		alternativeSpellings = '';
		notes = '';
		partOfSpeech = '';
		pluralForm = '';
		isPluralOnly = false;
		alternativePluralForms = '';
		presentAnee = '';
		presentInyee = '';
		presentInee = '';
		presentEchek = '';
		presentOkwek = '';
		presentIchek = '';
		wordError = null;
		wordEditingId = null;
	}

	function resetSentenceForm() {
		sentenceKalenjin = '';
		sentenceEnglish = '';
		sentenceNotes = '';
		sentenceError = null;
		sentenceEditingId = null;
	}

	type WordFormValues = {
		kalenjin: string;
		translations: string;
		partOfSpeech: string;
		notes: string;
		alternativeSpellings: string;
		pluralForm: string;
		isPluralOnly: boolean;
		alternativePluralForms: string;
		presentAnee: string;
		presentInyee: string;
		presentInee: string;
		presentEchek: string;
		presentOkwek: string;
		presentIchek: string;
	};

	type SentenceFormValues = {
		kalenjin: string;
		english: string;
		notes: string;
	};

	function openWord() {
		untrack(() => {
			resetWordForm();
			const values =
				form && 'wordValues' in form ? (form.wordValues as WordFormValues | undefined) : null;
			if (values) {
				kalenjin = values.kalenjin;
				translations = values.translations;
				alternativeSpellings = values.alternativeSpellings;
				notes = values.notes;
				partOfSpeech = (values.partOfSpeech as PartOfSpeech | '') || '';
				pluralForm = values.pluralForm;
				isPluralOnly = values.isPluralOnly;
				alternativePluralForms = values.alternativePluralForms;
				presentAnee = values.presentAnee;
				presentInyee = values.presentInyee;
				presentInee = values.presentInee;
				presentEchek = values.presentEchek;
				presentOkwek = values.presentOkwek;
				presentIchek = values.presentIchek;
				wordError =
					form && 'wordError' in form && form.wordError ? form.wordError : null;
				wordEditingId =
					form && 'wordEditingId' in form && typeof form.wordEditingId === 'string'
						? form.wordEditingId
						: null;
			}
		});
		wordOpen = true;
	}

	function openWordForEdit(s: WordSuggestion) {
		untrack(() => {
			resetWordForm();
			kalenjin = s.kalenjin;
			translations = s.translations;
			alternativeSpellings = s.alternativeSpellings ?? '';
			notes = s.notes ?? '';
			partOfSpeech = (s.partOfSpeech ?? '') as PartOfSpeech | '';
			pluralForm = s.pluralForm ?? '';
			isPluralOnly = s.isPluralOnly ?? false;
			alternativePluralForms = s.alternativePluralForms ?? '';
			presentAnee = s.presentAnee ?? '';
			presentInyee = s.presentInyee ?? '';
			presentInee = s.presentInee ?? '';
			presentEchek = s.presentEchek ?? '';
			presentOkwek = s.presentOkwek ?? '';
			presentIchek = s.presentIchek ?? '';
			wordEditingId = s.id;
		});
		wordOpen = true;
	}

	function openSentence() {
		untrack(() => {
			resetSentenceForm();
			const values =
				form && 'sentenceValues' in form
					? (form.sentenceValues as SentenceFormValues | undefined)
					: null;
			if (values) {
				sentenceKalenjin = values.kalenjin;
				sentenceEnglish = values.english;
				sentenceNotes = values.notes;
				sentenceError =
					form && 'sentenceError' in form && form.sentenceError ? form.sentenceError : null;
				sentenceEditingId =
					form && 'sentenceEditingId' in form && typeof form.sentenceEditingId === 'string'
						? form.sentenceEditingId
						: null;
			}
		});
		sentenceOpen = true;
	}

	function openSentenceForEdit(s: SentenceSuggestion) {
		untrack(() => {
			resetSentenceForm();
			sentenceKalenjin = s.kalenjin;
			sentenceEnglish = s.english;
			sentenceNotes = s.notes ?? '';
			sentenceEditingId = s.id;
		});
		sentenceOpen = true;
	}

	function closeWord() {
		if (wordSubmitting) return;
		wordOpen = false;
	}

	function closeSentence() {
		if (sentenceSubmitting) return;
		sentenceOpen = false;
	}

	// If the server returned validation errors after navigation, reopen the modal so the user can fix them.
	$effect(() => {
		if (form && 'wordError' in form && form.wordError && !wordOpen) {
			openWord();
		}
	});
	$effect(() => {
		if (form && 'sentenceError' in form && form.sentenceError && !sentenceOpen) {
			openSentence();
		}
	});
</script>

<svelte:head>
	<title>Contribute · Kalenjin</title>
</svelte:head>

<div class="page-head">
	<div>
		<div class="page-kicker">Contribute</div>
		<h1>Help build the dictionary</h1>
		<p>
			Suggest new words or example sentences. Each submission goes to staff for review before it
			joins the public dictionary or corpus.
		</p>
	</div>
</div>

<section class="suggest-cards">
	<button type="button" class="suggest-card" onclick={openWord}>
		<h2>Suggest a word</h2>
		<p>Add a Kalenjin word or phrase that is missing from the dictionary.</p>
		<span class="suggest-card-cta">New word suggestion →</span>
	</button>
	<button type="button" class="suggest-card" onclick={openSentence}>
		<h2>Suggest a sentence</h2>
		<p>Contribute an example sentence with its English translation.</p>
		<span class="suggest-card-cta">New sentence suggestion →</span>
	</button>
</section>

<section class="suggest-section">
	<h2>Your word suggestions</h2>
	{#if data.wordSuggestions.length === 0}
		<p class="empty">You haven't suggested any words yet.</p>
	{:else}
		<table class="suggest-table">
			<thead>
				<tr>
					<th>Kalenjin</th>
					<th>Translations</th>
					<th>Status</th>
					<th>Submitted</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.wordSuggestions as suggestion (suggestion.id)}
					<tr>
						<td><strong>{suggestion.kalenjin}</strong></td>
						<td>{suggestion.translations}</td>
						<td>
							<span class={statusClass(suggestion.status)}>{statusLabel(suggestion.status)}</span>
							{#if suggestion.status === 'APPROVED' && suggestion.approvedWordId}
								<a
									class="approved-link"
									href={dictionaryEntryHref({
										id: suggestion.approvedWordId,
										kalenjin: suggestion.kalenjin
									})}>view entry</a
								>
							{/if}
						</td>
						<td>{dateFmt.format(suggestion.createdAt)}</td>
						<td class="row-action">
							{#if suggestion.status === 'PENDING'}
								<button
									type="button"
									class="btn-sm ghost"
									onclick={() => openWordForEdit(suggestion)}
								>
									Edit
								</button>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<section class="suggest-section">
	<h2>Your sentence suggestions</h2>
	{#if data.sentenceSuggestions.length === 0}
		<p class="empty">You haven't suggested any sentences yet.</p>
	{:else}
		<table class="suggest-table">
			<thead>
				<tr>
					<th>Kalenjin</th>
					<th>English</th>
					<th>Status</th>
					<th>Submitted</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.sentenceSuggestions as suggestion (suggestion.id)}
					<tr>
						<td>{suggestion.kalenjin}</td>
						<td>{suggestion.english}</td>
						<td>
							<span class={statusClass(suggestion.status)}>{statusLabel(suggestion.status)}</span>
							{#if suggestion.status === 'APPROVED' && suggestion.approvedSentenceId}
								<a class="approved-link" href={`/corpus/${suggestion.approvedSentenceId}`}>view</a>
							{/if}
						</td>
						<td>{dateFmt.format(suggestion.createdAt)}</td>
						<td class="row-action">
							{#if suggestion.status === 'PENDING'}
								<button
									type="button"
									class="btn-sm ghost"
									onclick={() => openSentenceForEdit(suggestion)}
								>
									Edit
								</button>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<Modal
	open={wordOpen}
	title={wordEditingId ? 'Edit word suggestion' : 'Suggest a word'}
	labelledBy="suggest-word-title"
	busy={wordSubmitting}
	onclose={closeWord}
>
	<form
		method="POST"
		action="?/suggestWord"
		class="suggest-modal-form"
		use:enhance={() => {
			wordSubmitting = true;
			wordError = null;
			return async ({ result }) => {
				wordSubmitting = false;
				if (result.type === 'success') {
					const payload = result.data as
						| { wordSubmitted?: { kalenjin?: string }; wordUpdated?: { kalenjin?: string } }
						| undefined;
					if (payload?.wordUpdated) {
						const name = payload.wordUpdated.kalenjin;
						toast.success(name ? `Updated ${name} ✓` : 'Suggestion updated ✓');
					} else {
						const name = payload?.wordSubmitted?.kalenjin;
						toast.success(name ? `Suggested ${name} ✓` : 'Word suggestion submitted ✓');
					}
					wordOpen = false;
					resetWordForm();
					await invalidateAll();
					return;
				}
				if (result.type === 'failure') {
					wordError =
						(result.data?.wordError as string | undefined) ??
						'Could not submit your suggestion.';
					return;
				}
				await applyAction(result);
			};
		}}
	>
		{#if wordEditingId}
			<input type="hidden" name="editingId" value={wordEditingId} />
		{/if}
		<FormErrorFeedback error={wordError} />

		<LemmaFormFields
			bind:kalenjin
			bind:translations
			bind:alternativeSpellings
			bind:notes
			bind:partOfSpeech
			bind:pluralForm
			bind:isPluralOnly
			bind:alternativePluralForms
			bind:presentAnee
			bind:presentInyee
			bind:presentInee
			bind:presentEchek
			bind:presentOkwek
			bind:presentIchek
			idPrefix="suggest-word"
			kalenjinLabel="Kalenjin"
			alternativeSpellingsHint="comma, separated"
		/>

		<div class="modal-actions">
			<button type="button" class="btn ghost" onclick={closeWord} disabled={wordSubmitting}>
				Cancel
			</button>
			<button type="submit" class="btn" disabled={wordSubmitting}>
				{#if wordSubmitting}
					Saving…
				{:else if wordEditingId}
					Save changes
				{:else}
					Submit suggestion
				{/if}
			</button>
		</div>
	</form>
</Modal>

<Modal
	open={sentenceOpen}
	title={sentenceEditingId ? 'Edit sentence suggestion' : 'Suggest a sentence'}
	labelledBy="suggest-sentence-title"
	busy={sentenceSubmitting}
	onclose={closeSentence}
>
	<form
		method="POST"
		action="?/suggestSentence"
		class="suggest-modal-form"
		use:enhance={() => {
			sentenceSubmitting = true;
			sentenceError = null;
			return async ({ result }) => {
				sentenceSubmitting = false;
				if (result.type === 'success') {
					const payload = result.data as
						| { sentenceUpdated?: boolean; sentenceSubmitted?: boolean }
						| undefined;
					toast.success(
						payload?.sentenceUpdated
							? 'Suggestion updated ✓'
							: 'Sentence suggestion submitted ✓'
					);
					sentenceOpen = false;
					resetSentenceForm();
					await invalidateAll();
					return;
				}
				if (result.type === 'failure') {
					sentenceError =
						(result.data?.sentenceError as string | undefined) ??
						'Could not submit your suggestion.';
					return;
				}
				await applyAction(result);
			};
		}}
	>
		{#if sentenceEditingId}
			<input type="hidden" name="editingId" value={sentenceEditingId} />
		{/if}
		<FormErrorFeedback error={sentenceError} />

		<div class="field">
			<label for="suggest-sentence-kalenjin">Kalenjin sentence</label>
			<textarea
				id="suggest-sentence-kalenjin"
				name="kalenjin"
				class="input"
				rows="3"
				required
				bind:value={sentenceKalenjin}
			></textarea>
		</div>

		<div class="field">
			<label for="suggest-sentence-english">English translation</label>
			<textarea
				id="suggest-sentence-english"
				name="english"
				class="input"
				rows="3"
				required
				bind:value={sentenceEnglish}
			></textarea>
		</div>

		<div class="field">
			<label for="suggest-sentence-notes">
				Notes <span class="optional">(optional)</span>
			</label>
			<textarea
				id="suggest-sentence-notes"
				name="notes"
				class="input"
				rows="2"
				placeholder="Context, dialect, or anything reviewers should know"
				bind:value={sentenceNotes}
			></textarea>
		</div>

		<div class="modal-actions">
			<button type="button" class="btn ghost" onclick={closeSentence} disabled={sentenceSubmitting}>
				Cancel
			</button>
			<button type="submit" class="btn" disabled={sentenceSubmitting}>
				{#if sentenceSubmitting}
					Saving…
				{:else if sentenceEditingId}
					Save changes
				{:else}
					Submit suggestion
				{/if}
			</button>
		</div>
	</form>
</Modal>

<style>
	.suggest-cards {
		display: grid;
		gap: 12px;
		grid-template-columns: 1fr;
		margin: 16px 0 24px;
	}
	@media (min-width: 640px) {
		.suggest-cards {
			grid-template-columns: 1fr 1fr;
		}
	}
	.suggest-card {
		display: block;
		width: 100%;
		padding: 18px 20px;
		border-radius: 10px;
		border: 1px solid var(--rule, var(--line));
		background: var(--bg-elev, var(--paper));
		text-align: left;
		text-decoration: none;
		color: inherit;
		cursor: pointer;
		font: inherit;
		transition: border-color 0.15s, transform 0.15s;
	}
	.suggest-card:hover {
		border-color: var(--brand);
		transform: translateY(-1px);
	}
	.suggest-card h2 {
		margin: 0 0 6px;
		font-size: 1.05rem;
	}
	.suggest-card p {
		margin: 0 0 10px;
		color: var(--ink-mute);
	}
	.suggest-card-cta {
		font-weight: 600;
		color: var(--brand);
	}
	.suggest-section {
		margin-top: 32px;
	}
	.suggest-section h2 {
		font-size: 1.05rem;
		margin-bottom: 10px;
	}
	.suggest-table {
		width: 100%;
		border-collapse: collapse;
	}
	.suggest-table th,
	.suggest-table td {
		text-align: left;
		padding: 8px 10px;
		border-bottom: 1px solid var(--rule, var(--line));
		vertical-align: top;
	}
	.suggest-table th {
		font-size: 0.85rem;
		color: var(--ink-mute);
		font-weight: 600;
	}
	.note-cell {
		color: var(--ink-mute);
		max-width: 280px;
	}
	.row-action {
		text-align: right;
		white-space: nowrap;
	}
	.status-pill {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 600;
	}
	.status-pending {
		background: color-mix(in oklch, var(--ink-mute) 16%, transparent);
		color: var(--ink-mute);
	}
	.status-approved {
		background: color-mix(in oklch, var(--brand) 20%, transparent);
		color: var(--brand);
	}
	.status-rejected {
		background: color-mix(in oklch, #c44 20%, transparent);
		color: #c44;
	}
	.approved-link {
		margin-left: 6px;
		font-size: 0.85rem;
	}
	.empty {
		color: var(--ink-mute);
	}
	.suggest-modal-form {
		display: grid;
		gap: 0.75rem;
	}
	.modal-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}
	.optional {
		color: var(--ink-mute);
		font-weight: normal;
	}
	.field {
		display: grid;
		gap: 4px;
	}
	.field label {
		font-size: 12px;
		font-weight: 500;
	}
	.input {
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: 8px;
		color: var(--ink);
		font: inherit;
		padding: 8px 10px;
		width: 100%;
	}
	.input:focus {
		border-color: var(--brand);
		outline: 2px solid color-mix(in oklch, var(--brand) 30%, transparent);
		outline-offset: 1px;
	}
</style>
