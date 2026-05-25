<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/stores/toast.svelte';
	import { stripWordLinks } from '$lib/word-links';
	import { parseTranslationList } from '$lib/translations';
	import LemmaFormFields from '$lib/components/LemmaFormFields.svelte';
	import ImageUploadField from '$lib/components/ImageUploadField.svelte';
	import DuplicateSuggestions from '$lib/components/DuplicateSuggestions.svelte';
	import SwahiliLoanIndicator from '$lib/components/SwahiliLoanIndicator.svelte';
	import SwahiliLoanToggle from '$lib/components/SwahiliLoanToggle.svelte';
	import {
		ADD_WORD_INTENT_LABELS,
		readAddWordIntent,
		saveAddWordIntent,
		type AddWordIntent
	} from '$lib/stores/addWordAction';
	import type { PartOfSpeech } from '@prisma/client';

	export type AddWordInitial = {
		kalenjin?: string;
		translations?: string;
		alternativeSpellings?: string;
		notes?: string;
		partOfSpeech?: PartOfSpeech | '';
		pluralForm?: string;
		isPluralOnly?: boolean;
		isSwahiliLoan?: boolean;
		alternativePluralForms?: string;
		presentAnee?: string;
		presentInyee?: string;
		presentInee?: string;
		presentEchek?: string;
		presentOkwek?: string;
		presentIchek?: string;
	};

	type DictionarySearchResult = {
		id: string;
		kalenjin: string;
		translations: string;
		partOfSpeech: PartOfSpeech | null;
		isSwahiliLoan: boolean;
	};

	let {
		open = $bindable(false),
		title = 'Add dictionary word',
		formAction = '?/createWord',
		idPrefix = 'add-word',
		initial = null,
		enableImageUpload = true,
		enableRelatedWords = true,
		enableDuplicateSearch = true,
		enableIntentMenu = true,
		extraHidden,
		onclose,
		onsuccess,
		successToast = (result: unknown) => {
			const data = result as { word?: { kalenjin?: string } } | undefined;
			const name = data?.word?.kalenjin;
			return name ? `Added ${name} ✓` : 'Word added ✓';
		}
	}: {
		open?: boolean;
		title?: string;
		formAction?: string;
		idPrefix?: string;
		initial?: AddWordInitial | null;
		enableImageUpload?: boolean;
		enableRelatedWords?: boolean;
		enableDuplicateSearch?: boolean;
		enableIntentMenu?: boolean;
		extraHidden?: Snippet;
		onclose?: () => void;
		onsuccess?: (result: unknown) => void;
		successToast?: (result: unknown) => string | null;
	} = $props();

	let submitting = $state(false);
	let error = $state<string | null>(null);
	let kalenjin = $state('');
	let translations = $state('');
	let alternativeSpellings = $state('');
	let notes = $state('');
	let partOfSpeech = $state<PartOfSpeech | ''>('');
	let pluralForm = $state('');
	let isPluralOnly = $state(false);
	let isSwahiliLoan = $state(false);
	let alternativePluralForms = $state('');
	let presentAnee = $state('');
	let presentInyee = $state('');
	let presentInee = $state('');
	let presentEchek = $state('');
	let presentOkwek = $state('');
	let presentIchek = $state('');
	let kalenjinInput = $state<HTMLInputElement | null>(null);
	let formEl = $state<HTMLFormElement | null>(null);

	const ADD_WORD_INTENTS = ['stay', 'open'] as const satisfies readonly AddWordIntent[];
	let intent = $state<AddWordIntent>('stay');
	let actionMenuOpen = $state(false);
	let actionWrap = $state<HTMLDivElement | null>(null);

	let related = $state<DictionarySearchResult[]>([]);
	let relatedQuery = $state('');
	let relatedSearchResults = $state<DictionarySearchResult[] | null>(null);
	let relatedSearchQuery = $state('');
	let relatedSearchLoading = $state(false);
	let relatedSearchTimer: ReturnType<typeof setTimeout> | null = null;
	let relatedSearchSeq = 0;

	const relatedIds = $derived(new Set(related.map((w) => w.id)));
	const attachableRelatedResults = $derived(
		(relatedSearchResults ?? []).filter((r) => !relatedIds.has(r.id))
	);
	const relatedIdsValue = $derived(related.map((w) => w.id).join(','));
	const duplicateQuery = $derived(kalenjin.trim());

	function relatedGloss(value: string): string {
		return stripWordLinks(parseTranslationList(value)[0] ?? value);
	}

	function clearRelatedSearch() {
		relatedQuery = '';
		relatedSearchResults = null;
		relatedSearchQuery = '';
		relatedSearchLoading = false;
		if (relatedSearchTimer) clearTimeout(relatedSearchTimer);
	}

	async function runRelatedSearch(query: string) {
		const seq = ++relatedSearchSeq;
		const trimmed = query.trim();
		if (!trimmed) {
			relatedSearchResults = null;
			relatedSearchQuery = '';
			relatedSearchLoading = false;
			return;
		}
		relatedSearchLoading = true;
		try {
			const res = await fetch(`/dictionary/search?q=${encodeURIComponent(trimmed)}`);
			if (!res.ok) throw new Error(`Search failed: ${res.status}`);
			const json = (await res.json()) as { results: DictionarySearchResult[] };
			if (seq !== relatedSearchSeq) return;
			relatedSearchResults = json.results;
			relatedSearchQuery = trimmed;
		} catch {
			if (seq !== relatedSearchSeq) return;
			relatedSearchResults = [];
			relatedSearchQuery = trimmed;
		} finally {
			if (seq === relatedSearchSeq) relatedSearchLoading = false;
		}
	}

	function handleRelatedSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		relatedQuery = value;
		if (relatedSearchTimer) clearTimeout(relatedSearchTimer);
		relatedSearchTimer = setTimeout(() => runRelatedSearch(value), 180);
	}

	function handleRelatedSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (relatedSearchTimer) clearTimeout(relatedSearchTimer);
			runRelatedSearch(relatedQuery);
		}
	}

	function addRelated(result: DictionarySearchResult) {
		if (relatedIds.has(result.id)) return;
		related = [...related, result];
		clearRelatedSearch();
	}

	function removeRelated(id: string) {
		related = related.filter((w) => w.id !== id);
	}

	export function reset({ keepPartOfSpeech = false } = {}) {
		kalenjin = '';
		translations = '';
		alternativeSpellings = '';
		notes = '';
		if (!keepPartOfSpeech) partOfSpeech = '';
		pluralForm = '';
		isPluralOnly = false;
		isSwahiliLoan = false;
		alternativePluralForms = '';
		presentAnee = '';
		presentInyee = '';
		presentInee = '';
		presentEchek = '';
		presentOkwek = '';
		presentIchek = '';
		error = null;
		related = [];
		clearRelatedSearch();
	}

	function applyInitial(values: AddWordInitial | null | undefined) {
		reset();
		if (!values) return;
		if (values.kalenjin !== undefined) kalenjin = values.kalenjin;
		if (values.translations !== undefined) translations = values.translations;
		if (values.alternativeSpellings !== undefined)
			alternativeSpellings = values.alternativeSpellings;
		if (values.notes !== undefined) notes = values.notes;
		if (values.partOfSpeech !== undefined) partOfSpeech = values.partOfSpeech;
		if (values.pluralForm !== undefined) pluralForm = values.pluralForm;
		if (values.isPluralOnly !== undefined) isPluralOnly = values.isPluralOnly;
		if (values.isSwahiliLoan !== undefined) isSwahiliLoan = values.isSwahiliLoan;
		if (values.alternativePluralForms !== undefined)
			alternativePluralForms = values.alternativePluralForms;
		if (values.presentAnee !== undefined) presentAnee = values.presentAnee;
		if (values.presentInyee !== undefined) presentInyee = values.presentInyee;
		if (values.presentInee !== undefined) presentInee = values.presentInee;
		if (values.presentEchek !== undefined) presentEchek = values.presentEchek;
		if (values.presentOkwek !== undefined) presentOkwek = values.presentOkwek;
		if (values.presentIchek !== undefined) presentIchek = values.presentIchek;
	}

	function close() {
		if (submitting) return;
		actionMenuOpen = false;
		open = false;
		onclose?.();
	}

	function toggleActionMenu() {
		actionMenuOpen = !actionMenuOpen;
	}

	function selectIntent(next: AddWordIntent) {
		intent = next;
		saveAddWordIntent(next);
		actionMenuOpen = false;
	}

	function handleBackdrop(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			close();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			if (!submitting) {
				formEl?.requestSubmit();
			}
		}
	}

	// When the dialog opens, prime state from the latest `initial`, restore the intent
	// preference, and focus the first input. Use untrack so the live state writes
	// don't kick the effect into a re-run loop.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			applyInitial(initial);
			if (enableIntentMenu) {
				intent = readAddWordIntent();
			}
			actionMenuOpen = false;
		});
		const timeout = window.setTimeout(() => kalenjinInput?.focus(), 0);
		return () => window.clearTimeout(timeout);
	});

	$effect(() => {
		if (!open) return;
		function onWindowKeydown(event: KeyboardEvent) {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			close();
		}
		window.addEventListener('keydown', onWindowKeydown);
		return () => window.removeEventListener('keydown', onWindowKeydown);
	});

	$effect(() => {
		if (!actionMenuOpen) return;
		function onPointerDown(event: MouseEvent) {
			const wrap = actionWrap;
			if (!wrap) return;
			if (event.target instanceof Node && wrap.contains(event.target)) return;
			actionMenuOpen = false;
		}
		window.addEventListener('pointerdown', onPointerDown, true);
		return () => window.removeEventListener('pointerdown', onPointerDown, true);
	});
</script>

{#if open}
	<div
		class="add-word-backdrop"
		role="presentation"
		onclick={handleBackdrop}
		onkeydown={handleKeydown}
	>
		<div
			class="add-word-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="{idPrefix}-title"
		>
			<div class="add-word-head">
				<h2 id="{idPrefix}-title">{title}</h2>
				<button
					type="button"
					class="add-word-close"
					onclick={close}
					aria-label="Close"
					disabled={submitting}
				>×</button>
			</div>

			<form
				bind:this={formEl}
				method="POST"
				action={formAction}
				class="add-word-form"
				enctype={enableImageUpload ? 'multipart/form-data' : undefined}
				use:enhance={() => {
					submitting = true;
					error = null;
					return async ({ result }) => {
						submitting = false;
						if (result.type === 'redirect') {
							open = false;
							await applyAction(result);
							return;
						}
						if (result.type === 'failure') {
							error =
								(result.data?.error as string | undefined) ?? 'Could not save the word.';
							return;
						}
						if (result.type === 'success') {
							const msg = successToast(result.data);
							if (msg) toast.success(msg);
							if (onsuccess) {
								onsuccess(result.data);
							} else {
								reset({ keepPartOfSpeech: enableIntentMenu });
								await invalidateAll();
								kalenjinInput?.focus();
							}
						}
					};
				}}
			>
				{#if error}
					<p class="add-word-error">{error}</p>
				{/if}
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
					{idPrefix}
					kalenjinLabel="Kalenjin"
					alternativeSpellingsHint="comma, separated"
					linkable={enableRelatedWords}
				/>
				<div class="add-word-origin">
					<SwahiliLoanToggle bind:checked={isSwahiliLoan} />
				</div>
				{#if enableImageUpload}
					<ImageUploadField name="image" idPrefix="{idPrefix}-image" />
				{/if}
				{#if enableDuplicateSearch}
					<DuplicateSuggestions
						searchEndpoint="/dictionary/search?lang=kalenjin"
						query={duplicateQuery}
						linkBase="/dictionary/"
						primaryKey="kalenjin"
						secondaryKey="translations"
						label="Possible matching words"
						minQueryLength={2}
					/>
				{/if}
				{#if enableRelatedWords}
					<div class="add-word-related">
						<span class="add-word-related-label">Related words</span>
						{#if related.length > 0}
							<ul class="add-word-related-chips">
								{#each related as rel (rel.id)}
									<li class="add-word-related-chip">
										<span>{rel.kalenjin}</span>
										<button
											type="button"
											aria-label={`Remove ${rel.kalenjin}`}
											onclick={() => removeRelated(rel.id)}>×</button>
									</li>
								{/each}
							</ul>
						{/if}
						<input
							id="{idPrefix}-related-search"
							type="search"
							class="input"
							placeholder="Search Kalenjin or English to link"
							autocomplete="off"
							value={relatedQuery}
							oninput={handleRelatedSearchInput}
							onkeydown={handleRelatedSearchKeydown}
						/>
						{#if relatedSearchLoading}
							<p class="add-word-related-hint">Searching…</p>
						{:else if relatedSearchResults !== null}
							{#if attachableRelatedResults.length === 0}
								<p class="add-word-related-hint">
									No matches for “{relatedSearchQuery}”.
								</p>
							{:else}
								<ul class="add-word-related-results">
									{#each attachableRelatedResults as result (result.id)}
										<li>
											<button
												type="button"
												class="add-word-related-result"
												onclick={() => addRelated(result)}
											>
												<span>
													<strong>{result.kalenjin}</strong>
													{#if result.isSwahiliLoan}
														<SwahiliLoanIndicator compact />
													{/if}
													<small>{relatedGloss(result.translations)}</small>
												</span>
												<span class="add-word-related-add">Add</span>
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						{/if}
						<input type="hidden" name="relatedWordIds" value={relatedIdsValue} />
					</div>
				{/if}
				{#if enableIntentMenu}
					<input type="hidden" name="intent" value={intent} />
				{/if}
				{#if extraHidden}{@render extraHidden()}{/if}
				<div class="add-word-actions">
					<button
						type="button"
						class="btn ghost"
						onclick={close}
						disabled={submitting}>Cancel</button>
					{#if enableIntentMenu}
						<div class="add-word-split" bind:this={actionWrap}>
							<button
								type="submit"
								class="btn add-word-split-main"
								disabled={submitting}
							>
								{submitting ? 'Saving…' : ADD_WORD_INTENT_LABELS[intent]}
							</button>
							<button
								type="button"
								class="btn add-word-split-toggle"
								aria-haspopup="menu"
								aria-expanded={actionMenuOpen}
								aria-label="Choose create action"
								onclick={toggleActionMenu}
								disabled={submitting}
							>
								<span aria-hidden="true">▾</span>
							</button>
							{#if actionMenuOpen}
								<div class="add-word-split-menu" role="menu">
									{#each ADD_WORD_INTENTS as next (next)}
										{@const itemSelected = intent === next}
										<button
											type="button"
											role="menuitemradio"
											aria-checked={itemSelected}
											class="add-word-split-item"
											class:selected={itemSelected}
											onclick={() => selectIntent(next)}
										>
											{ADD_WORD_INTENT_LABELS[next]}
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{:else}
						<button type="submit" class="btn" disabled={submitting}>
							{submitting ? 'Saving…' : 'Save'}
						</button>
					{/if}
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.add-word-backdrop {
		align-items: flex-start;
		background: rgba(15, 23, 42, 0.35);
		display: flex;
		inset: 0;
		justify-content: center;
		overflow-y: auto;
		padding: 3rem 1rem;
		position: fixed;
		z-index: 60;
	}

	.add-word-dialog {
		background: var(--bg-raised, var(--paper));
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: 0 20px 45px rgba(15, 23, 42, 0.25);
		display: grid;
		gap: 1rem;
		max-width: 640px;
		padding: 1.25rem 1.5rem 1.5rem;
		width: 100%;
	}

	.add-word-head {
		align-items: center;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	.add-word-head h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.add-word-close {
		background: transparent;
		border: 0;
		color: var(--ink-soft, #334155);
		cursor: pointer;
		font-size: 1.5rem;
		line-height: 1;
		padding: 0.25rem 0.5rem;
	}
	.add-word-close:hover:not(:disabled) {
		color: var(--ink, #0f172a);
	}
	.add-word-close:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.add-word-form {
		display: grid;
		gap: 0.75rem;
	}

	.add-word-error {
		background: color-mix(in oklch, var(--danger) 12%, transparent);
		border: 1px solid color-mix(in oklch, var(--danger) 40%, transparent);
		border-radius: 8px;
		color: var(--danger);
		font-weight: 500;
		margin: 0;
		padding: 8px 12px;
	}

	.add-word-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}

	.add-word-split {
		display: inline-flex;
		position: relative;
	}
	.add-word-split-main {
		border-bottom-right-radius: 0;
		border-top-right-radius: 0;
	}
	.add-word-split-toggle {
		align-items: center;
		border-bottom-left-radius: 0;
		border-left: 1px solid color-mix(in oklch, var(--on-brand) 35%, transparent);
		border-top-left-radius: 0;
		display: inline-flex;
		font-size: 11px;
		justify-content: center;
		padding: 11px 10px;
	}
	.add-word-split-menu {
		background: var(--bg-raised, var(--surface));
		border: 1px solid var(--line);
		border-radius: 10px;
		bottom: calc(100% + 6px);
		box-shadow: 0 8px 24px oklch(0 0 0 / 0.12);
		display: flex;
		flex-direction: column;
		min-width: 100%;
		overflow: hidden;
		position: absolute;
		right: 0;
		width: max-content;
		z-index: 5;
	}
	.add-word-split-item {
		background: transparent;
		border: 0;
		color: var(--ink);
		cursor: pointer;
		font: inherit;
		font-size: 13px;
		padding: 9px 14px;
		text-align: left;
		white-space: nowrap;
	}
	.add-word-split-item:hover {
		background: color-mix(in oklch, var(--brand) 10%, transparent);
	}
	.add-word-split-item.selected {
		background: color-mix(in oklch, var(--brand) 16%, transparent);
		color: var(--brand-ink, var(--brand));
		font-weight: 600;
	}

	.add-word-related {
		display: grid;
		gap: 8px;
	}

	.add-word-related-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.add-word-related-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.add-word-related-chip {
		align-items: center;
		background: color-mix(in oklch, var(--accent) 14%, var(--paper));
		border: 1px solid color-mix(in oklch, var(--accent) 34%, var(--line));
		border-radius: 999px;
		display: inline-flex;
		font-size: 13px;
		gap: 6px;
		padding: 4px 6px 4px 10px;
	}

	.add-word-related-chip button {
		background: transparent;
		border: 0;
		color: var(--ink-soft, #334155);
		cursor: pointer;
		font-size: 15px;
		line-height: 1;
		padding: 0 4px;
	}
	.add-word-related-chip button:hover {
		color: var(--danger);
	}

	.add-word-related-hint {
		color: var(--ink-mute);
		font-size: 13px;
		margin: 0;
	}

	.add-word-related-results {
		border: 1px solid var(--line);
		border-radius: 8px;
		display: grid;
		list-style: none;
		margin: 0;
		max-height: 200px;
		overflow-y: auto;
		padding: 0;
	}

	.add-word-related-result {
		align-items: center;
		background: transparent;
		border: 0;
		border-bottom: 1px solid color-mix(in oklch, var(--line) 60%, transparent);
		cursor: pointer;
		display: flex;
		font: inherit;
		gap: 10px;
		justify-content: space-between;
		padding: 8px 10px;
		text-align: left;
		width: 100%;
	}
	.add-word-related-results li:last-child .add-word-related-result {
		border-bottom: 0;
	}
	.add-word-related-result:hover {
		background: color-mix(in oklch, var(--brand) 8%, transparent);
	}
	.add-word-related-result small {
		color: var(--ink-mute);
		margin-left: 6px;
	}
	.add-word-related-add {
		color: var(--brand);
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
	}
</style>
