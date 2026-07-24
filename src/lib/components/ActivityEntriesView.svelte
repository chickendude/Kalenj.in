<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import PartOfSpeechInline from '$lib/components/PartOfSpeechInline.svelte';
	import SentenceStatusToggle from '$lib/components/SentenceStatusToggle.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import WordProofreadToggle from '$lib/components/WordProofreadToggle.svelte';
	import { PARTS_OF_SPEECH, PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import { RANGE_IDS, RANGE_LABELS, RANGE_SHORT_LABELS } from '$lib/stats';
	import { toast } from '$lib/stores/toast.svelte';
	import type { ActivityEntriesData } from '$lib/server/activity-entries';

	type ActivityForm = {
		updateSuccess?: string;
		deleteSuccess?: string;
		proofreadSuccess?: string;
		updateError?: string;
		proofreadError?: string;
	} | null;

	let {
		data,
		form,
		adminView = false
	}: {
		data: ActivityEntriesData;
		form: ActivityForm;
		/** Admin drill-down: id-scoped links, admin page title. */
		adminView?: boolean;
	} = $props();

	const basePath = $derived(adminView ? `/admin/activity/${data.targetUser.id}` : '/activity');

	type EditableField = 'kalenjin' | 'pos' | 'translations' | 'pluralForm' | 'incertainForm';

	const FIELD_LABELS: Record<
		Exclude<EditableField, 'kalenjin' | 'pos'>,
		string
	> = {
		translations: 'translations',
		pluralForm: 'plural form',
		incertainForm: 'incertain form'
	};

	let editing = $state<{ wordId: string; field: EditableField; width: number } | null>(null);

	function startEdit(wordId: string, field: EditableField, event: MouseEvent) {
		// Size the inline input to the text it replaces so the row barely moves.
		const width = (event.currentTarget as HTMLElement).offsetWidth;
		editing = { wordId, field, width };
	}

	function isEditing(wordId: string, field: EditableField): boolean {
		return editing?.wordId === wordId && editing.field === field;
	}

	// Match the replaced text exactly so nothing beside it moves; only tiny
	// values like the "—" placeholder get a typeable minimum.
	const editWidth = $derived((editing?.width ?? 0) < 40 ? 80 : (editing?.width ?? 0) + 2);

	// Focus and select the clicked field once its input renders.
	function focusField(node: HTMLInputElement) {
		node.select();
	}

	function focusSelect(node: HTMLSelectElement) {
		node.focus();
	}

	function onEditKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') editing = null;
	}

	$effect(() => {
		if (form && 'updateSuccess' in form && form.updateSuccess) {
			toast.success(form.updateSuccess);
			editing = null;
		}
	});
	$effect(() => {
		if (form && 'deleteSuccess' in form && form.deleteSuccess) toast.success(form.deleteSuccess);
	});
	$effect(() => {
		if (form && 'updateError' in form && form.updateError) toast.error(form.updateError);
	});
	$effect(() => {
		if (form && 'proofreadError' in form && form.proofreadError) toast.error(form.proofreadError);
	});

	let pendingDelete = $state<{ form: HTMLFormElement; kalenjin: string } | null>(null);

	// Intercept the click, before any submit event exists: enhance's submit
	// handler ignores preventDefault from other listeners, so a submit-time
	// interception would let the delete through while the dialog opens.
	function requestDeleteWord(event: MouseEvent, kalenjin: string) {
		event.preventDefault();
		const form = (event.currentTarget as HTMLButtonElement).form;
		if (!form) return;
		pendingDelete = { form, kalenjin };
	}

	function confirmPendingDelete() {
		const pending = pendingDelete;
		if (!pending) return;
		pending.form.requestSubmit();
		pendingDelete = null;
	}

	const numberFmt = new Intl.NumberFormat();
	const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	const displayName = $derived(data.targetUser.displayName ?? data.targetUser.username);
	const pageCount = $derived(Math.max(1, Math.ceil(data.totalCount / data.pageSize)));

	function pageHref({
		type = data.type,
		range = data.range,
		page = 1
	}: {
		type?: 'words' | 'sentences';
		range?: string;
		page?: number;
	}): string {
		const params = new URLSearchParams({ type, range });
		if (page > 1) params.set('page', String(page));
		return `${basePath}?${params.toString()}`;
	}
</script>

<svelte:head>
	<title>{adminView ? `${displayName}'s ${data.type} · Admin` : `My activity — Kalenj.in`}</title>
</svelte:head>

<div class="entry-controls">
	<div class="entry-controls-group">
		<div class="type-tabs" role="tablist" aria-label="Entry type">
			<a
				href={pageHref({ type: 'words' })}
				class="type-tab"
				class:active={data.type === 'words'}
				aria-current={data.type === 'words' ? 'page' : undefined}>Words</a
			>
			<a
				href={pageHref({ type: 'sentences' })}
				class="type-tab"
				class:active={data.type === 'sentences'}
				aria-current={data.type === 'sentences' ? 'page' : undefined}>Sentences</a
			>
		</div>
		<div class="entry-count">
			<span class="entry-count-name">{displayName}</span>
			<span class="entry-count-divider" aria-hidden="true">|</span>
			<b>{numberFmt.format(data.totalCount)}</b>
			{data.type === 'words'
				? `word${data.totalCount === 1 ? '' : 's'}`
				: `sentence${data.totalCount === 1 ? '' : 's'}`}
			{#if data.proofreadCount !== null}
				<span class="entry-count-accepted"
					>({numberFmt.format(data.proofreadCount)} accepted)</span
				>
			{/if}
		</div>
	</div>
	<div class="period-buttons" role="radiogroup" aria-label="Range">
		{#each RANGE_IDS as r (r)}
			<Tooltip label={RANGE_LABELS[r]} placement="bottom">
				<a
					href={pageHref({ range: r })}
					class="period-btn"
					class:active={data.range === r}
					aria-current={data.range === r ? 'page' : undefined}
				>
					{RANGE_SHORT_LABELS[r]}
				</a>
			</Tooltip>
		{/each}
	</div>
</div>

{#snippet fieldEditor(
	entry: (typeof data.entries)[number],
	field: 'translations' | 'pluralForm' | 'incertainForm',
	current: string
)}
	{#if isEditing(entry.id, field)}
		<form method="POST" action="?/updateWordField" use:enhance class="inline-edit-form">
			<input type="hidden" name="wordId" value={entry.id} />
			<input type="hidden" name="field" value={field} />
			<input
				name="value"
				class="inline-edit-input"
				style="width: {editWidth}px"
				aria-label={`${FIELD_LABELS[field]} of ${entry.kalenjin}`}
				autocomplete="off"
				required={field === 'translations'}
				value={current}
				use:focusField
				onkeydown={onEditKeydown}
				onblur={() => (editing = null)}
			/>
		</form>
	{:else}
		<button
			type="button"
			class="cell-edit"
			class:muted={!current}
			aria-label={`Edit ${FIELD_LABELS[field]} of ${entry.kalenjin}`}
			onclick={(event) => startEdit(entry.id, field, event)}>{current || '—'}</button
		>
	{/if}
{/snippet}

{#if data.entries.length === 0}
	<p class="empty-note">
		No {data.type} added by {displayName} in this range.
	</p>
{:else}
	<table class="users-table">
		<thead>
			<tr>
				<th>Kalenjin</th>
				<th>{data.type === 'words' ? 'Translations' : 'English'}</th>
				{#if data.type === 'words'}
					<th>Plural</th>
					<th>Incertain</th>
				{/if}
				<th class="status-col">Status</th>
				<th class="num">Added</th>
				{#if data.type === 'words'}
					<th class="actions-col"><span class="sr-only">Actions</span></th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each data.entries as entry (entry.id)}
				{@const hasForms =
					entry.partOfSpeech === 'NOUN' || entry.partOfSpeech === 'ADJECTIVE'}
				<tr>
					<td>
						<span class="word-with-pos">
							{#if data.type === 'words'}
								{#if isEditing(entry.id, 'kalenjin')}
									<form
										method="POST"
										action="?/updateWordKalenjin"
										use:enhance
										class="inline-edit-form"
									>
										<input type="hidden" name="wordId" value={entry.id} />
										<input
											name="kalenjin"
											class="inline-edit-input strong"
											style="width: {editWidth}px"
											aria-label={`Kalenjin spelling of ${entry.kalenjin}`}
											autocomplete="off"
											required
											value={entry.kalenjin}
											use:focusField
											onkeydown={onEditKeydown}
											onblur={() => (editing = null)}
										/>
									</form>
								{:else}
									<button
										type="button"
										class="cell-edit"
										aria-label={`Edit spelling of ${entry.kalenjin}`}
										onclick={(event) => startEdit(entry.id, 'kalenjin', event)}
										><strong>{entry.kalenjin}</strong></button
									>
								{/if}
								{#if isEditing(entry.id, 'pos')}
									<form
										method="POST"
										action="?/updateWordPartOfSpeech"
										use:enhance
										class="inline-edit-form"
									>
										<input type="hidden" name="wordId" value={entry.id} />
										<select
											name="partOfSpeech"
											class="select pos-select"
											aria-label={`Part of speech for ${entry.kalenjin}`}
											value={entry.partOfSpeech ?? ''}
											use:focusSelect
											onchange={(event) => event.currentTarget.form?.requestSubmit()}
											onkeydown={onEditKeydown}
											onblur={() => (editing = null)}
										>
											<option value="">None</option>
											{#each PARTS_OF_SPEECH as pos (pos)}
												<option value={pos}>{PART_OF_SPEECH_LABELS[pos]}</option>
											{/each}
										</select>
									</form>
								{:else}
									<button
										type="button"
										class="cell-edit pos-edit"
										aria-label={`Change part of speech of ${entry.kalenjin}`}
										onclick={(event) => startEdit(entry.id, 'pos', event)}
									>
										{#if entry.partOfSpeech}
											<PartOfSpeechInline value={entry.partOfSpeech} size="tiny" />
										{:else}
											<span class="pos-empty">?</span>
										{/if}
									</button>
								{/if}
							{:else}
								<a href={entry.href}><strong>{entry.kalenjin}</strong></a>
							{/if}
						</span>
					</td>
					<td>
						{#if data.type === 'words'}
							{@render fieldEditor(entry, 'translations', entry.english)}
						{:else}
							{entry.english}
						{/if}
					</td>
					{#if data.type === 'words'}
						{@const canEditPlural = hasForms && !entry.isPluralOnly}
						{@const canEditIncertain = entry.partOfSpeech === 'NOUN' && !entry.isPluralOnly}
						<td class="form-col">
							{#if canEditPlural}
								{@render fieldEditor(entry, 'pluralForm', entry.pluralForm ?? '')}
							{:else if hasForms}
								{#if entry.pluralForm}{entry.pluralForm}{:else}<span class="form-missing">—</span
									>{/if}
							{/if}
						</td>
						<td class="form-col">
							{#if canEditIncertain}
								{@render fieldEditor(entry, 'incertainForm', entry.incertainForm ?? '')}
							{:else if entry.incertainForm}
								{entry.incertainForm}
							{/if}
						</td>
					{/if}
					<td class="status-col">
						{#if data.type === 'words'}
							<WordProofreadToggle
								wordId={entry.id}
								proofread={Boolean(entry.proofreadAt)}
								canEdit={data.viewerIsAdmin}
							/>
						{:else if entry.status}
							<SentenceStatusToggle status={entry.status} />
						{/if}
					</td>
					<td class="num">{dateFmt.format(entry.createdAt)}</td>
					{#if data.type === 'words'}
						<td class="actions-col">
							<div class="row-icon-actions">
								<Tooltip label="View entry">
									<a
										class="icon-action"
										href={entry.href}
										aria-label={`View ${entry.kalenjin} in the dictionary`}
									>
										<svg
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
										>
											<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
											<polyline points="15 3 21 3 21 9" />
											<line x1="10" y1="14" x2="21" y2="3" />
										</svg>
									</a>
								</Tooltip>
								<form method="POST" action="?/deleteWord" use:enhance>
									<input type="hidden" name="wordId" value={entry.id} />
									<Tooltip label="Delete word">
										<button
											type="submit"
											class="icon-action danger"
											aria-label={`Delete ${entry.kalenjin}`}
											onclick={(event) => requestDeleteWord(event, entry.kalenjin)}
										>
											<svg
												width="16"
												height="16"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												aria-hidden="true"
											>
												<polyline points="3 6 5 6 21 6" />
												<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
												<path d="M10 11v6" />
												<path d="M14 11v6" />
												<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
											</svg>
										</button>
									</Tooltip>
								</form>
							</div>
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<ConfirmDialog
	open={pendingDelete !== null}
	title="Delete this word?"
	message={`"${pendingDelete?.kalenjin ?? ''}" will be permanently removed from the dictionary.`}
	confirmLabel="Delete word"
	variant="danger"
	onconfirm={confirmPendingDelete}
	oncancel={() => (pendingDelete = null)}
/>

{#if pageCount > 1}
	<nav class="pagination" aria-label="Pages">
		{#if data.page > 1}
			<a class="btn-sm ghost" href={pageHref({ page: data.page - 1 })}>← Previous</a>
		{/if}
		<span class="page-indicator">Page {data.page} of {pageCount}</span>
		{#if data.page < pageCount}
			<a class="btn-sm ghost" href={pageHref({ page: data.page + 1 })}>Next →</a>
		{/if}
	</nav>
{/if}

<style>
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.status-col {
		text-align: center;
		width: 1%;
		white-space: nowrap;
	}

	.form-missing {
		color: var(--ink-mute);
	}

	.cell-edit {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.cell-edit:hover,
	.cell-edit:focus-visible {
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}

	.cell-edit.muted {
		color: var(--ink-mute);
	}

	/* The editor replaces the clicked text in normal flow — no border, no
	   background, same font — so it reads as editing the cell text itself.
	   Only a dashed underline marks the editable region. */
	.inline-edit-form {
		display: inline-flex;
		margin: 0;
	}

	.inline-edit-input {
		box-sizing: border-box;
		padding: 0;
		border: 0;
		border-bottom: 1px dashed color-mix(in oklch, var(--accent) 60%, var(--line));
		border-radius: 0;
		background: transparent;
		font: inherit;
		color: inherit;
	}

	.inline-edit-input.strong {
		font-weight: 650;
	}

	.inline-edit-input:focus {
		outline: none;
		border-bottom-color: var(--accent);
	}

	/* Where supported, size the input to its text exactly (and grow as the
	   user types); the measured inline width is only the fallback. */
	@supports (field-sizing: content) {
		.inline-edit-input {
			field-sizing: content;
			width: auto !important;
			min-width: 40px;
			max-width: 100%;
		}
	}

	.pos-edit:hover,
	.pos-edit:focus-visible {
		text-decoration: none;
	}

	.pos-edit :global(.word-pill) {
		cursor: pointer;
	}

	.pos-empty {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px dashed var(--line);
		border-radius: 999px;
		padding: 0.2rem 0.46rem;
		font-size: 0.78rem;
		font-weight: 600;
		line-height: 1;
		color: var(--ink-mute);
	}

	.pos-select {
		padding: 2px 6px;
		font-size: 12px;
		min-height: 0;
		height: auto;
	}

	.actions-col {
		width: 1%;
		white-space: nowrap;
	}

	.row-icon-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 4px;
	}

	.row-icon-actions form {
		display: inline-flex;
	}

	.icon-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: 0;
		border-radius: 6px;
		background: none;
		color: var(--ink-mute);
		cursor: pointer;
	}

	.icon-action:hover,
	.icon-action:focus-visible {
		background: var(--surface);
		color: var(--ink);
		text-decoration: none;
	}

	.icon-action.danger:hover,
	.icon-action.danger:focus-visible {
		background: var(--danger-soft);
		color: var(--danger);
	}

	.entry-controls-group {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.entry-count {
		color: var(--ink-mute);
		font-size: 0.9rem;
		white-space: nowrap;
	}

	.entry-count-name {
		color: var(--ink);
		font-weight: 600;
	}

	.entry-count-divider {
		margin: 0 4px;
		color: var(--line);
	}

	.entry-count b {
		color: var(--ink);
		font-size: 1.05rem;
		font-variant-numeric: tabular-nums;
	}

	.entry-count-accepted {
		font-variant-numeric: tabular-nums;
	}

	.entry-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
		margin-bottom: 1.25rem;
	}

	.type-tabs {
		display: inline-flex;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--bg-raised);
		overflow: hidden;
	}

	.type-tab {
		padding: 9px 16px;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
		text-decoration: none;
	}

	.type-tab + .type-tab {
		border-left: 1px solid var(--line);
	}

	.type-tab:hover {
		background: var(--surface);
		text-decoration: none;
	}

	.type-tab.active {
		background: var(--brand);
		color: var(--on-brand);
	}

	.period-buttons {
		display: inline-flex;
		max-width: 100%;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--bg-raised);
	}

	/* Each range button is wrapped in a Tooltip, which renders a .tooltip-host
	   span between .period-buttons and the link. Segment separators and end
	   rounding live on that wrapper. */
	.period-buttons :global(.tooltip-host) {
		border-right: 1px solid var(--line);
	}

	.period-buttons :global(.tooltip-host:last-child) {
		border-right: none;
	}

	.period-btn {
		display: inline-block;
		padding: 9px 13px;
		background: transparent;
		color: var(--ink);
		font-size: 13px;
		font-weight: 500;
		text-decoration: none;
		transition: background 0.15s;
	}

	.period-buttons :global(.tooltip-host:first-child .period-btn) {
		border-top-left-radius: var(--radius);
		border-bottom-left-radius: var(--radius);
	}

	.period-buttons :global(.tooltip-host:last-child .period-btn) {
		border-top-right-radius: var(--radius);
		border-bottom-right-radius: var(--radius);
	}

	.period-btn:hover {
		background: var(--surface);
		text-decoration: none;
	}

	.period-btn.active {
		background: var(--brand);
		color: var(--on-brand);
	}

	.empty-note {
		color: var(--ink-mute);
	}

	.pagination {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 1.25rem;
	}

	.page-indicator {
		color: var(--ink-mute);
		font-size: 0.9rem;
	}
</style>
