<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import FormErrorFeedback from '$lib/components/FormErrorFeedback.svelte';
	import AddWordDialog, { type AddWordInitial } from '$lib/components/AddWordDialog.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { splitPluralFormVariants } from '$lib/plural-form-variants';
	import { toast } from '$lib/stores/toast.svelte';
	import { dictionaryEntryHref } from '$lib/word-url';
	import { invalidateAll } from '$app/navigation';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const dateFmt = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	function displayUser(u: { username: string; displayName: string | null } | null): string {
		if (!u) return '—';
		return u.displayName ? `${u.displayName} (${u.username})` : u.username;
	}

	function statusLabel(status: 'PENDING' | 'APPROVED' | 'REJECTED'): string {
		switch (status) {
			case 'PENDING':
				return 'Pending';
			case 'APPROVED':
				return 'Approved';
			case 'REJECTED':
				return 'Declined';
		}
	}

	function statusClass(status: 'PENDING' | 'APPROVED' | 'REJECTED'): string {
		return `status-pill status-${status.toLowerCase()}`;
	}

	type WordSuggestion = PageData['wordSuggestions'][number];
	type SentenceSuggestion = PageData['sentenceSuggestions'][number];

	let approvalOpen = $state(false);
	let approvalSuggestionId = $state<string | null>(null);
	let approvalInitial = $state<AddWordInitial | null>(null);

	function openApproval(s: WordSuggestion) {
		approvalSuggestionId = s.id;
		approvalInitial = {
			kalenjin: s.kalenjin,
			translations: s.translations,
			partOfSpeech: s.partOfSpeech ?? '',
			notes: s.notes ?? '',
			alternativeSpellings: s.alternativeSpellings ?? '',
			pluralForm: s.pluralForm ?? '',
			isPluralOnly: s.isPluralOnly ?? false,
			isSingularOnly: s.isSingularOnly ?? false,
			alternativePluralForms: s.alternativePluralForms ?? '',
			incertainForm: splitPluralFormVariants(s.incertainForm ?? '').pluralForm,
			alternativeIncertainForms: splitPluralFormVariants(s.incertainForm ?? '')
				.alternativePluralForms,
			presentAnee: s.presentAnee ?? '',
			presentInyee: s.presentInyee ?? '',
			presentInee: s.presentInee ?? '',
			presentEchek: s.presentEchek ?? '',
			presentOkwek: s.presentOkwek ?? '',
			presentIchek: s.presentIchek ?? ''
		};
		approvalOpen = true;
	}

	// Sentence review modal state
	let sentenceReviewOpen = $state(false);
	let sentenceReviewSubmitting = $state(false);
	let sentenceReviewError = $state<string | null>(null);
	let sentenceReviewId = $state<string | null>(null);
	let sentenceReviewKalenjin = $state('');
	let sentenceReviewEnglish = $state('');
	let sentenceReviewNotes = $state('');

	function openSentenceReview(s: SentenceSuggestion) {
		sentenceReviewId = s.id;
		sentenceReviewKalenjin = s.kalenjin;
		sentenceReviewEnglish = s.english;
		sentenceReviewNotes = s.notes ?? '';
		sentenceReviewError = null;
		sentenceReviewOpen = true;
	}

	function closeSentenceReview() {
		if (sentenceReviewSubmitting) return;
		sentenceReviewOpen = false;
	}

	$effect(() => {
		if (form && 'rejectedWord' in form && form.rejectedWord) {
			toast.success('Word suggestion declined.');
		} else if (form && 'rejectedSentence' in form && form.rejectedSentence) {
			toast.success('Sentence suggestion declined.');
		}
	});
</script>

<svelte:head>
	<title>Suggestions · Admin</title>
</svelte:head>

<div class="page-head">
	<div>
		<div class="page-kicker">Admin</div>
		<h1>Suggestions</h1>
		<p>Review words and sentences submitted by signed-in users.</p>
	</div>
	<div class="page-stat">
		<b>{data.pendingWordCount + data.pendingSentenceCount}</b>
		pending
	</div>
</div>

<nav class="status-tabs" data-sveltekit-noscroll data-sveltekit-replacestate>
	{#each [['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Declined'], ['ALL', 'All']] as [value, label] (value)}
		<a
			href={`?status=${value}`}
			class:active={data.statusFilter === value}
			aria-current={data.statusFilter === value ? 'page' : undefined}
		>
			{label}
		</a>
	{/each}
</nav>

<FormErrorFeedback error={form && 'error' in form ? form.error : null} />

<section class="admin-section">
	<header class="section-head">
		<h2>Word suggestions</h2>
		<span class="muted">{data.wordSuggestions.length} shown · {data.pendingWordCount} pending</span>
	</header>
	{#if data.wordSuggestions.length === 0}
		<p class="empty">No suggestions for this filter.</p>
	{:else}
		<table class="suggest-table">
			<thead>
				<tr>
					<th>Kalenjin</th>
					<th>Translations</th>
					<th>POS</th>
					<th>Notes</th>
					<th>Submitter</th>
					<th>Submitted</th>
					<th>Status</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.wordSuggestions as s (s.id)}
					<tr>
						<td><strong>{s.kalenjin}</strong></td>
						<td>{s.translations}</td>
						<td>{s.partOfSpeech ?? '—'}</td>
						<td class="note-cell">{s.notes ?? '—'}</td>
						<td>{displayUser(s.submitter)}</td>
						<td>{dateFmt.format(s.createdAt)}</td>
						<td>
							<span class={statusClass(s.status)}>{statusLabel(s.status)}</span>
							{#if s.status === 'APPROVED' && s.approvedWord}
								<a class="approved-link" href={dictionaryEntryHref(s.approvedWord)}>view entry</a>
							{/if}
							{#if s.status !== 'PENDING' && s.reviewer}
								<div class="reviewer">
									by {displayUser(s.reviewer)}
									{#if s.reviewedAt}· {dateFmt.format(s.reviewedAt)}{/if}
								</div>
							{/if}
						</td>
						<td>
							{#if s.status === 'PENDING'}
								<div class="row-actions">
									<button type="button" class="btn-sm" onclick={() => openApproval(s)}>
										Review
									</button>
									<form method="POST" action="?/rejectWord" use:enhance class="inline-form">
										<input type="hidden" name="id" value={s.id} />
										<button type="submit" class="btn-sm danger">Decline</button>
									</form>
								</div>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<section class="admin-section">
	<header class="section-head">
		<h2>Sentence suggestions</h2>
		<span class="muted">{data.sentenceSuggestions.length} shown · {data.pendingSentenceCount} pending</span>
	</header>
	{#if data.sentenceSuggestions.length === 0}
		<p class="empty">No suggestions for this filter.</p>
	{:else}
		<table class="suggest-table">
			<thead>
				<tr>
					<th>Kalenjin</th>
					<th>English</th>
					<th>Notes</th>
					<th>Submitter</th>
					<th>Submitted</th>
					<th>Status</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.sentenceSuggestions as s (s.id)}
					<tr>
						<td>{s.kalenjin}</td>
						<td>{s.english}</td>
						<td class="note-cell">{s.notes ?? '—'}</td>
						<td>{displayUser(s.submitter)}</td>
						<td>{dateFmt.format(s.createdAt)}</td>
						<td>
							<span class={statusClass(s.status)}>{statusLabel(s.status)}</span>
							{#if s.status === 'APPROVED' && s.approvedSentence}
								<a class="approved-link" href={`/corpus/${s.approvedSentence.id}`}>view</a>
							{/if}
							{#if s.status !== 'PENDING' && s.reviewer}
								<div class="reviewer">
									by {displayUser(s.reviewer)}
									{#if s.reviewedAt}· {dateFmt.format(s.reviewedAt)}{/if}
								</div>
							{/if}
						</td>
						<td>
							{#if s.status === 'PENDING'}
								<div class="row-actions">
									<button type="button" class="btn-sm" onclick={() => openSentenceReview(s)}>
										Review
									</button>
									<form method="POST" action="?/rejectSentence" use:enhance class="inline-form">
										<input type="hidden" name="id" value={s.id} />
										<button type="submit" class="btn-sm danger">Decline</button>
									</form>
								</div>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<AddWordDialog
	bind:open={approvalOpen}
	title="Review word suggestion"
	formAction="?/approveWord"
	idPrefix="admin-suggest"
	initial={approvalInitial}
	enableIntentMenu={false}
	successToast={(result) => {
		const data = result as { word?: { kalenjin?: string } } | undefined;
		const name = data?.word?.kalenjin;
		return name ? `Approved ${name} ✓` : 'Suggestion approved ✓';
	}}
	onsuccess={async () => {
		approvalOpen = false;
		approvalSuggestionId = null;
		approvalInitial = null;
		await invalidateAll();
	}}
>
	{#snippet extraHidden()}
		{#if approvalSuggestionId}
			<input type="hidden" name="suggestionId" value={approvalSuggestionId} />
		{/if}
	{/snippet}
</AddWordDialog>

<Modal
	open={sentenceReviewOpen}
	title="Review sentence suggestion"
	labelledBy="admin-suggest-sentence-title"
	busy={sentenceReviewSubmitting}
	onclose={closeSentenceReview}
>
	<form
		method="POST"
		action="?/approveSentence"
		class="review-form"
		use:enhance={() => {
			sentenceReviewSubmitting = true;
			sentenceReviewError = null;
			return async ({ result }) => {
				sentenceReviewSubmitting = false;
				if (result.type === 'success') {
					toast.success('Sentence approved and added to the corpus ✓');
					sentenceReviewOpen = false;
					sentenceReviewId = null;
					await invalidateAll();
					return;
				}
				if (result.type === 'failure') {
					sentenceReviewError =
						(result.data?.error as string | undefined) ?? 'Could not approve the suggestion.';
					return;
				}
				await applyAction(result);
			};
		}}
	>
		{#if sentenceReviewId}
			<input type="hidden" name="suggestionId" value={sentenceReviewId} />
		{/if}
		<FormErrorFeedback error={sentenceReviewError} />

		<div class="field">
			<label for="admin-suggest-sentence-kalenjin">Kalenjin sentence</label>
			<textarea
				id="admin-suggest-sentence-kalenjin"
				name="kalenjin"
				class="input"
				rows="3"
				required
				bind:value={sentenceReviewKalenjin}
			></textarea>
		</div>

		<div class="field">
			<label for="admin-suggest-sentence-english">English translation</label>
			<textarea
				id="admin-suggest-sentence-english"
				name="english"
				class="input"
				rows="3"
				required
				bind:value={sentenceReviewEnglish}
			></textarea>
		</div>

		<div class="field">
			<label for="admin-suggest-sentence-notes">
				Notes <span class="optional">(optional)</span>
			</label>
			<textarea
				id="admin-suggest-sentence-notes"
				name="notes"
				class="input"
				rows="2"
				bind:value={sentenceReviewNotes}
			></textarea>
		</div>

		<div class="review-actions">
			<button
				type="button"
				class="btn ghost"
				onclick={closeSentenceReview}
				disabled={sentenceReviewSubmitting}>Cancel</button>
			<button type="submit" class="btn" disabled={sentenceReviewSubmitting}>
				{sentenceReviewSubmitting ? 'Approving…' : 'Approve'}
			</button>
		</div>
	</form>
</Modal>

<style>
	.status-tabs {
		display: flex;
		gap: 4px;
		margin: 8px 0 16px;
		flex-wrap: wrap;
	}
	.status-tabs a {
		padding: 6px 12px;
		border-radius: 6px;
		text-decoration: none;
		color: var(--ink-mute);
		border: 1px solid var(--rule, var(--line));
		background: var(--bg-elev, var(--paper));
		font-size: 0.9rem;
	}
	.status-tabs a.active {
		color: var(--brand);
		border-color: var(--brand);
		background: color-mix(in oklch, var(--brand) 12%, transparent);
	}
	.admin-section {
		margin-top: 28px;
	}
	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 8px;
	}
	.section-head h2 {
		font-size: 1.05rem;
		margin: 0;
	}
	.muted {
		color: var(--ink-mute);
		font-size: 0.85rem;
	}
	.suggest-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	.suggest-table th,
	.suggest-table td {
		text-align: left;
		padding: 8px 10px;
		border-bottom: 1px solid var(--rule, var(--line));
		vertical-align: top;
	}
	.suggest-table th {
		font-size: 0.8rem;
		color: var(--ink-mute);
		font-weight: 600;
	}
	.note-cell {
		color: var(--ink-mute);
		max-width: 220px;
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
	.row-actions {
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}
	.inline-form {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.reviewer {
		font-size: 0.8rem;
		color: var(--ink-mute);
		margin-top: 4px;
	}
	.empty {
		color: var(--ink-mute);
	}
	.review-form {
		display: grid;
		gap: 0.75rem;
	}
	.review-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}
	.field {
		display: grid;
		gap: 4px;
	}
	.field label {
		font-size: 12px;
		font-weight: 500;
	}
	.optional {
		color: var(--ink-mute);
		font-weight: normal;
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
