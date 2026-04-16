<script lang="ts">
	import { enhance } from '$app/forms';
	import { groupSentenceTokens } from '$lib/word-groups';
	import type { ActionResult } from '@sveltejs/kit';

	type DictionaryWord = {
		id: string;
		kalenjin: string;
		translations: string;
	};

	type SentenceToken = {
		id: string;
		tokenOrder: number;
		surfaceForm: string;
		wordId: string | null;
		inContextTranslation?: string | null;
		word?: {
			id: string;
			kalenjin: string;
			translations?: string | null;
			notes?: string | null;
			spellings?: Array<{
				id?: string;
				spelling: string;
				spellingNormalized?: string;
			}>;
		} | null;
	};

	type SearchResult = {
		id: string;
		kalenjin: string;
		translations: string;
		notes?: string | null;
	};

	type TokenDraft = {
		inContextTranslation: string;
		selectedWordId: string;
		createLemma: string;
		createTranslations: string;
		createNotes: string;
		createAlternativeSpellings: string;
	};

	type MergePrompt = {
		sourceTokenId: string;
		targetTokenId: string;
		sourceSurface: string;
		targetSurface: string;
	};

	type EnhancedSubmitResult = ActionResult<Record<string, unknown> | undefined, Record<string, unknown> | undefined>;
	type EnhancedUpdate = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;
	type TokenUpdatePayload = {
		tokenId: string;
		surfaceForm?: string;
		wordId: string | null;
		inContextTranslation?: string | null;
		word?: {
			id: string;
			kalenjin: string;
			translations?: string | null;
			notes?: string | null;
			spellings?: Array<{
				id?: string;
				spelling: string;
				spellingNormalized?: string;
			}>;
		} | null;
	};

	let {
		entityId,
		entityIdField,
		entityKind,
		sentenceId,
		sentenceText,
		tokens,
		dictionaryWords,
		updateAction,
		createAction,
		searchEndpoint,
		tokenGroupEndpoint
	}: {
		entityId: string;
		entityIdField: string;
		entityKind: 'story' | 'example';
		sentenceId: string;
		sentenceText: string;
		tokens: SentenceToken[];
		dictionaryWords: DictionaryWord[];
		updateAction: string;
		createAction: string;
		searchEndpoint: string;
		tokenGroupEndpoint: string;
	} = $props();

	let openTokenId = $state<string | null>(null);
	let searchQuery = $state('');
	let searchResults = $state<SearchResult[]>([]);
	let searchLoading = $state(false);
	let searchError = $state<string | null>(null);
	let saveState = $state<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
	let createState = $state<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
	let drafts = $state<Record<string, TokenDraft>>({});
	let updateForms = $state<Record<string, HTMLFormElement | null>>({});
	let meaningInputs = $state<Record<string, HTMLInputElement | null>>({});
	let localTokens = $state<SentenceToken[]>([]);
	let lastIncomingSignature = $state('');
	let searchInput = $state<HTMLInputElement | null>(null);
	let focusedTokenId = $state<string | null>(null);
	let draggedTokenId = $state<string | null>(null);
	let pendingMerge = $state<MergePrompt | null>(null);
	let mergeConfirmButton = $state<HTMLButtonElement | null>(null);
	let editingSurfaceTokenId = $state<string | null>(null);
	let surfaceDraft = $state('');
	let surfaceEditInput = $state<HTMLInputElement | null>(null);
	let groupActionError = $state<string | null>(null);
	const autoSaveTimers = new Map<string, number>();

		const groups = $derived(
			groupSentenceTokens({
				sentenceId,
				tokens: localTokens
			})
		);
	const activeToken = $derived(localTokens.find((token) => token.id === openTokenId) ?? null);
	const activeGroup = $derived(groups.find((group) => group.tokens[0]?.id === openTokenId) ?? null);

	function normalizeSearchQuery(value: string): string {
		return value.replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
	}

	function serializeSpellings(
		spellings: Array<{
			spelling: string;
		}> | null | undefined
	): string {
		return spellings?.map((spelling) => spelling.spelling).join(', ') ?? '';
	}

	$effect(() => {
		const incomingSignature = JSON.stringify(
			tokens.map((token) => ({
					id: token.id,
					surfaceForm: token.surfaceForm,
					wordId: token.wordId,
				inContextTranslation: token.inContextTranslation ?? null,
				wordKalenjin: token.word?.kalenjin ?? null,
				wordTranslations: token.word?.translations ?? null,
				wordNotes: token.word?.notes ?? null,
				wordSpellings: token.word?.spellings?.map((spelling) => spelling.spelling) ?? []
			}))
		);

		if (incomingSignature !== lastIncomingSignature) {
			localTokens = tokens.map((token) => ({
				...token,
				word: token.word ? { ...token.word } : token.word
			}));
			lastIncomingSignature = incomingSignature;
		}

		for (const token of localTokens) {
			drafts[token.id] = {
				inContextTranslation: token.inContextTranslation ?? '',
				selectedWordId: token.word?.id ?? '',
				createLemma: token.word?.kalenjin ?? normalizeSearchQuery(token.surfaceForm),
				createTranslations: token.word?.translations ?? '',
				createNotes: token.word?.notes ?? '',
				createAlternativeSpellings: serializeSpellings(token.word?.spellings)
			};
		}
	});

	$effect(() => {
		if (!openTokenId) {
			focusedTokenId = null;
			searchResults = [];
			searchLoading = false;
			searchError = null;
			return;
		}

		const currentQuery = searchQuery.trim();
		if (!currentQuery) {
			searchResults = [];
			searchLoading = false;
			searchError = null;
			return;
		}
		const controller = new AbortController();
		const timeout = window.setTimeout(async () => {
			searchLoading = true;
			searchError = null;

			try {
				const response = await fetch(
					`${searchEndpoint}?q=${encodeURIComponent(currentQuery)}`,
					{ signal: controller.signal }
				);

				if (!response.ok) {
					throw new Error('Search failed.');
				}

				const payload = (await response.json()) as { results?: SearchResult[] };
				searchResults = payload.results ?? [];
			} catch (error) {
				if (controller.signal.aborted) {
					return;
				}

				console.error(error);
				searchResults = [];
				searchError = 'Could not search right now.';
			} finally {
				if (!controller.signal.aborted) {
					searchLoading = false;
				}
			}
		}, 150);

		return () => {
			controller.abort();
			window.clearTimeout(timeout);
		};
	});

	$effect(() => {
		if (!openTokenId || focusedTokenId === openTokenId) {
			return;
		}

		const focusTimeout = window.setTimeout(() => {
			searchInput?.focus();
			searchInput?.select();
			focusedTokenId = openTokenId;
		}, 0);

		return () => {
			window.clearTimeout(focusTimeout);
		};
	});

	$effect(() => {
		if (!pendingMerge) {
			return;
		}

		const timeout = window.setTimeout(() => {
			mergeConfirmButton?.focus();
		}, 0);

		return () => window.clearTimeout(timeout);
	});

	$effect(() => {
		if (!editingSurfaceTokenId) {
			return;
		}

		const timeout = window.setTimeout(() => {
			surfaceEditInput?.focus();
			surfaceEditInput?.select();
		}, 0);

		return () => window.clearTimeout(timeout);
	});

	$effect(() => {
		if (!openTokenId && !pendingMerge) {
			return;
		}

		function handleWindowKeydown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				event.preventDefault();
				if (pendingMerge) {
					pendingMerge = null;
					return;
				}

				closePicker();
			}
		}

		window.addEventListener('keydown', handleWindowKeydown);
		return () => window.removeEventListener('keydown', handleWindowKeydown);
	});

	function openPicker(token: SentenceToken) {
		openTokenId = token.id;
		searchQuery = normalizeSearchQuery(token.word?.kalenjin ?? token.surfaceForm);
		searchResults = [];
		searchError = null;
		groupActionError = null;
	}

	function focusMeaningInput(tokenId: string | null) {
		if (!tokenId) {
			return;
		}

		window.setTimeout(() => {
			meaningInputs[tokenId]?.focus();
			meaningInputs[tokenId]?.select();
		}, 0);
	}

	function closePicker(tokenId: string | null = openTokenId) {
		openTokenId = null;
		groupActionError = null;
		focusMeaningInput(tokenId);
	}

	function handleBackdropKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			closePicker();
		}
	}

	function handleMeaningKeydown(event: KeyboardEvent, token: SentenceToken) {
		if (event.key === 'Enter') {
			event.preventDefault();
			openPicker(token);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			startSurfaceEdit(token.id);
		}
	}

	function handleModalKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closePicker();
			return;
		}

		event.stopPropagation();
	}

	function updateDraft(tokenId: string, field: keyof TokenDraft, value: string) {
		drafts[tokenId] = {
			...drafts[tokenId],
			[field]: value
		};
	}

	function resetEditorToCreate(token: SentenceToken) {
		drafts[token.id] = {
			...drafts[token.id],
			selectedWordId: '',
			createLemma: normalizeSearchQuery(token.surfaceForm),
			createTranslations: '',
			createNotes: '',
			createAlternativeSpellings: ''
		};
	}

	function replaceTokens(nextTokens: SentenceToken[]) {
		localTokens = nextTokens.map((token) => ({
			...token,
			word: token.word ? { ...token.word } : token.word
		}));
	}

	function handleSearchInput(tokenId: string, value: string) {
		const normalizedValue = normalizeSearchQuery(value);
		searchQuery = normalizedValue;

		drafts[tokenId] = {
			...drafts[tokenId],
			selectedWordId: '',
			createLemma: normalizedValue
		};
	}

	function queueTranslationAutosave(tokenId: string, value: string) {
		updateDraft(tokenId, 'inContextTranslation', value);
		applyTokenUpdates([
			{
			tokenId,
			wordId: localTokens.find((token) => token.id === tokenId)?.wordId ?? null,
			inContextTranslation: value,
			word: localTokens.find((token) => token.id === tokenId)?.word ?? null
			}
		]);
		saveState[tokenId] = 'idle';

		const existingTimeout = autoSaveTimers.get(tokenId);
		if (existingTimeout) {
			window.clearTimeout(existingTimeout);
		}

		autoSaveTimers.set(
			tokenId,
			window.setTimeout(() => {
				updateForms[tokenId]?.requestSubmit();
				autoSaveTimers.delete(tokenId);
			}, 500)
		);
	}

	async function requestGroupAction(payload: Record<string, unknown>) {
		const response = await fetch(tokenGroupEndpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				kind: entityKind,
				sentenceId,
				...payload
			})
		});

		const result = (await response.json()) as {
			error?: string;
			tokens?: SentenceToken[];
		};

		if (!response.ok || !result.tokens) {
			throw new Error(result.error ?? 'Could not update sentence words.');
		}

		replaceTokens(result.tokens);
		groupActionError = null;
		return result.tokens;
	}

	function handleDragStart(tokenId: string) {
		draggedTokenId = tokenId;
	}

	function handleDragEnd() {
		draggedTokenId = null;
	}

	function handleDragOver(event: DragEvent, tokenId: string) {
		if (!draggedTokenId || draggedTokenId === tokenId) {
			return;
		}

		event.preventDefault();
	}

	function handleDrop(event: DragEvent, targetTokenId: string, targetSurface: string) {
		event.preventDefault();
		if (!draggedTokenId || draggedTokenId === targetTokenId) {
			draggedTokenId = null;
			return;
		}

		const sourceGroup = groups.find((group) => group.tokens[0]?.id === draggedTokenId);
		if (!sourceGroup) {
			draggedTokenId = null;
			return;
		}

		pendingMerge = {
			sourceTokenId: draggedTokenId,
			targetTokenId,
			sourceSurface: sourceGroup.fullSurface,
			targetSurface
		};
		draggedTokenId = null;
	}

	async function confirmMerge() {
		if (!pendingMerge) {
			return;
		}

		const mergePrompt = pendingMerge;

		try {
			const updatedTokens = await requestGroupAction({
				action: 'merge',
				sourceTokenId: mergePrompt.sourceTokenId,
				targetTokenId: mergePrompt.targetTokenId
			});
			const nextTokenId = updatedTokens.find((token) => token.id === mergePrompt.sourceTokenId)?.id
				?? updatedTokens.find((token) => token.id === mergePrompt.targetTokenId)?.id
				?? null;
			pendingMerge = null;
			if (openTokenId && nextTokenId) {
				openTokenId = nextTokenId;
			}
		} catch (mergeError) {
			groupActionError =
				mergeError instanceof Error ? mergeError.message : 'Could not combine those words.';
		}
	}

	async function splitActiveGroup() {
		if (!activeGroup || !activeToken) {
			return;
		}

		if (!window.confirm(`Split "${activeToken.surfaceForm}" into separate words?`)) {
			return;
		}

		try {
			const nextTokens = await requestGroupAction({
				action: 'split',
				tokenId: activeToken.id
			});
			closePicker();
			editingSurfaceTokenId = null;
			surfaceDraft = '';
			if (nextTokens.length > 0) {
				focusMeaningInput(nextTokens[0].id);
			}
		} catch (splitError) {
			groupActionError =
				splitError instanceof Error ? splitError.message : 'Could not split this word.';
		}
	}

	function startSurfaceEdit(tokenId: string) {
		const group = groups.find((entry) => entry.tokens[0]?.id === tokenId);
		if (!group) {
			return;
		}

		editingSurfaceTokenId = tokenId;
		surfaceDraft = group.fullSurface;
		groupActionError = null;
	}

	function cancelSurfaceEdit() {
		editingSurfaceTokenId = null;
		surfaceDraft = '';
		groupActionError = null;
	}

	async function saveSurfaceEdit(tokenId: string) {
		try {
			await requestGroupAction({
				action: 'surface',
				tokenId,
				surfaceForm: surfaceDraft
			});
			editingSurfaceTokenId = null;
			surfaceDraft = '';
		} catch (surfaceError) {
			groupActionError =
				surfaceError instanceof Error ? surfaceError.message : 'Could not update this word.';
		}
	}

	function enhanceUpdateForm(
		tokenId: string,
		options: { closeOnSuccess?: boolean; invalidateOnSuccess?: boolean } = {}
	) {
		const { closeOnSuccess = false, invalidateOnSuccess = false } = options;

		return () => {
			saveState[tokenId] = 'saving';

			return async ({
				result,
				update
			}: {
				result: EnhancedSubmitResult;
				update: EnhancedUpdate;
			}) => {
				if (result.type === 'success') {
					const tokenUpdates = (result.data as { tokenUpdates?: TokenUpdatePayload[] } | undefined)?.tokenUpdates;
					if (tokenUpdates?.length) {
						applyTokenUpdates(tokenUpdates);
					}

					if (invalidateOnSuccess) {
						await update({ reset: false, invalidateAll: true });
					}

					saveState[tokenId] = 'saved';

					if (closeOnSuccess) {
						closePicker();
					}

					window.setTimeout(() => {
						if (saveState[tokenId] === 'saved') {
							saveState[tokenId] = 'idle';
						}
					}, 600);
					return;
				}

				saveState[tokenId] = 'error';
			};
		};
	}

	function enhanceCreateForm(tokenId: string) {
		return () => {
			createState[tokenId] = 'saving';

			return async ({
				result,
				update
			}: {
				result: EnhancedSubmitResult;
				update: EnhancedUpdate;
			}) => {
				if (result.type === 'success') {
					const tokenUpdates = (result.data as { tokenUpdates?: TokenUpdatePayload[] } | undefined)?.tokenUpdates;
					if (tokenUpdates?.length) {
						applyTokenUpdates(tokenUpdates);
					}
					createState[tokenId] = 'saved';
					closePicker();
					window.setTimeout(() => {
						if (createState[tokenId] === 'saved') {
							createState[tokenId] = 'idle';
						}
					}, 600);
					return;
				}

				createState[tokenId] = 'error';
			};
		};
	}

	function applyTokenUpdates(tokenUpdates: TokenUpdatePayload[]) {
		for (const tokenUpdate of tokenUpdates) {
			localTokens = localTokens.map((token) =>
				token.id === tokenUpdate.tokenId
					? {
							...token,
							surfaceForm: tokenUpdate.surfaceForm ?? token.surfaceForm,
							wordId: tokenUpdate.wordId,
							inContextTranslation: tokenUpdate.inContextTranslation ?? null,
							word: tokenUpdate.word ?? null
						}
					: token
			);

			drafts[tokenUpdate.tokenId] = {
				...drafts[tokenUpdate.tokenId],
				inContextTranslation: tokenUpdate.inContextTranslation ?? '',
				selectedWordId: tokenUpdate.word?.id ?? '',
				createLemma:
					tokenUpdate.word?.kalenjin ??
					drafts[tokenUpdate.tokenId]?.createLemma ??
					normalizeSearchQuery(
						localTokens.find((token) => token.id === tokenUpdate.tokenId)?.surfaceForm ?? ''
					),
				createTranslations:
					tokenUpdate.word?.translations ?? drafts[tokenUpdate.tokenId]?.createTranslations ?? '',
				createNotes: tokenUpdate.word?.notes ?? drafts[tokenUpdate.tokenId]?.createNotes ?? '',
				createAlternativeSpellings:
					tokenUpdate.word?.spellings
						? serializeSpellings(tokenUpdate.word.spellings)
						: drafts[tokenUpdate.tokenId]?.createAlternativeSpellings ?? ''
			};
		}
	}
</script>

<div class="annotations">
	{#if groups.length === 0}
		<p class="empty-text">{sentenceText}</p>
	{:else}
		{#each groups as group (group.key)}
			{@const primaryToken = group.tokens[0]}
			{@const sharedWord = primaryToken.word}
			{@const meaningValue = drafts[primaryToken.id]?.inContextTranslation ?? ''}
			<div class="token-group">
				<div class="token-card">
					<div class:unlinked-lemma={!sharedWord} class="lemma-label">
						{#if sharedWord}
							{sharedWord.kalenjin}
						{:else}
							<span class="unlinked-marker" aria-hidden="true"></span>
						{/if}
					</div>

					{#if editingSurfaceTokenId === primaryToken.id}
						<input
							bind:this={surfaceEditInput}
							class="token-edit-input"
							value={surfaceDraft}
							oninput={(event) => (surfaceDraft = (event.currentTarget as HTMLInputElement).value)}
							onkeydown={(event) => {
								if (event.key === 'Enter') {
									event.preventDefault();
									void saveSurfaceEdit(primaryToken.id);
								} else if (event.key === 'Escape') {
									event.preventDefault();
									cancelSurfaceEdit();
								}
							}}
							onblur={() => cancelSurfaceEdit()}
						/>
					{:else}
						<button
							type="button"
							class="token-button"
							class:token-button--dragging={draggedTokenId === primaryToken.id}
							draggable="true"
							tabindex="-1"
							onclick={() => openPicker(primaryToken)}
							ondragstart={() => handleDragStart(primaryToken.id)}
							ondragend={handleDragEnd}
							ondragover={(event) => handleDragOver(event, primaryToken.id)}
							ondrop={(event) => handleDrop(event, primaryToken.id, group.fullSurface)}
						>
							{group.fullSurface}
						</button>
					{/if}

					<form
						method="POST"
						action={updateAction}
						class="translation-form"
						bind:this={updateForms[primaryToken.id]}
						use:enhance={enhanceUpdateForm(primaryToken.id)}
					>
						<input type="hidden" name={entityIdField} value={entityId} />
						<input type="hidden" name="tokenId" value={primaryToken.id} />
						<input type="hidden" name="wordId" value={sharedWord?.id ?? ''} />

						<input
							bind:this={meaningInputs[primaryToken.id]}
							class="meaning-input"
							class:meaning-input--empty={!meaningValue.trim()}
							class:meaning-input--saving={saveState[primaryToken.id] === 'saving'}
							class:meaning-input--saved={saveState[primaryToken.id] === 'saved'}
							name="inContextTranslation"
							value={meaningValue}
							size={Math.max(2, meaningValue.length || 0)}
							placeholder="Meaning"
							oninput={(event) =>
								queueTranslationAutosave(primaryToken.id, (event.currentTarget as HTMLInputElement).value)}
							onkeydown={(event) => handleMeaningKeydown(event, primaryToken)}
						/>

						{#if saveState[primaryToken.id] === 'error'}
							<small class="status-text error-text">Could not save.</small>
						{/if}
					</form>
				</div>
			</div>
		{/each}
	{/if}

	{#if activeToken && activeGroup}
		<div
			class="modal-backdrop"
			role="button"
			tabindex="0"
			aria-label="Close lemma picker"
			onclick={() => closePicker()}
			onkeydown={handleBackdropKeydown}
		>
			<div
				class="picker-modal"
				role="dialog"
				aria-modal="true"
				aria-label="Link root lemma"
				tabindex="-1"
				onclick={(event) => event.stopPropagation()}
				onkeydown={handleModalKeydown}
			>
				<div class="picker-header">
					<div>
						<strong>Link root lemma</strong>
						<p class="status-text">Word: "{activeGroup.fullSurface}"</p>
					</div>
					<button type="button" class="secondary-button" onclick={() => closePicker()}>Close</button>
				</div>

				{#if groupActionError}
					<p class="status-text error-text">{groupActionError}</p>
				{/if}

				<label>
					Search
					<input
						bind:this={searchInput}
						value={searchQuery}
						placeholder="Search lemma"
						oninput={(event) =>
							handleSearchInput(activeToken.id, (event.currentTarget as HTMLInputElement).value)}
					/>
				</label>

				<div class="results-list">
					{#if searchError}
						<p class="status-text error-text">{searchError}</p>
					{:else if !searchLoading && searchResults.length === 0}
						<p class="status-text">No search results yet.</p>
					{:else}
						{#each searchResults as result}
							<form
								method="POST"
								action={updateAction}
								use:enhance={enhanceUpdateForm(activeToken.id)}
							>
								<input type="hidden" name={entityIdField} value={entityId} />
								<input type="hidden" name="tokenId" value={activeToken.id} />
								<input type="hidden" name="wordId" value={result.id} />
								<input
									type="hidden"
									name="inContextTranslation"
									value={drafts[activeToken.id]?.inContextTranslation ?? ''}
								/>
								<button
									type="submit"
									class="result-button"
									class:selected-result={activeToken.wordId === result.id}
									title={`${result.kalenjin} — ${result.translations}`}
								>
									<span class="result-lemma">{result.kalenjin}</span>
									<small class="result-translations">{result.translations}</small>
								</button>
							</form>
						{/each}
					{/if}
				</div>

				<div class="create-box">
					<div class="editor-header">
						<strong>{drafts[activeToken.id]?.selectedWordId ? 'Update lemma' : 'Create new lemma'}</strong>
						<div class="editor-actions">
							{#if activeToken.wordId}
								<form
									method="POST"
									action={updateAction}
									use:enhance={enhanceUpdateForm(activeToken.id, {
										closeOnSuccess: true,
										invalidateOnSuccess: true
									})}
								>
									<input type="hidden" name={entityIdField} value={entityId} />
									<input type="hidden" name="tokenId" value={activeToken.id} />
									<input type="hidden" name="wordId" value="" />
									<input
										type="hidden"
										name="inContextTranslation"
										value={drafts[activeToken.id]?.inContextTranslation ?? ''}
									/>
									<button type="submit" class="secondary-button">Clear lemma</button>
								</form>
							{/if}

							{#if drafts[activeToken.id]?.selectedWordId}
								<button
									type="button"
									class="secondary-button"
									onclick={() => resetEditorToCreate(activeToken)}
								>
									New lemma
								</button>
							{/if}

							{#if activeToken.surfaceForm.trim().includes(' ')}
								<button type="button" class="secondary-button" onclick={() => void splitActiveGroup()}>
									Split words
								</button>
							{/if}
						</div>
					</div>
					<form
						method="POST"
						action={createAction}
						class="create-form"
						use:enhance={enhanceCreateForm(activeToken.id)}
					>
						<input type="hidden" name={entityIdField} value={entityId} />
						<input type="hidden" name="tokenId" value={activeToken.id} />
						<input type="hidden" name="wordId" value={drafts[activeToken.id]?.selectedWordId ?? ''} />
						<input
							type="hidden"
							name="inContextTranslation"
							value={drafts[activeToken.id]?.inContextTranslation ?? ''}
						/>

						<div class="lemma-row">
							<label>
								Lemma
								<input
									name="kalenjin"
									required
									value={drafts[activeToken.id]?.createLemma ?? activeToken.surfaceForm}
									oninput={(event) =>
										updateDraft(activeToken.id, 'createLemma', (event.currentTarget as HTMLInputElement).value)}
								/>
							</label>

							<label>
								Alternative spellings
								<input
									name="alternativeSpellings"
									placeholder="alt1, alt2"
									value={drafts[activeToken.id]?.createAlternativeSpellings ?? ''}
									oninput={(event) =>
										updateDraft(
											activeToken.id,
											'createAlternativeSpellings',
											(event.currentTarget as HTMLInputElement).value
										)}
								/>
							</label>
						</div>

						<label>
							Translations
							<input
								name="translations"
								required
								placeholder="translations"
								value={drafts[activeToken.id]?.createTranslations ?? ''}
								oninput={(event) =>
									updateDraft(activeToken.id, 'createTranslations', (event.currentTarget as HTMLInputElement).value)}
							/>
						</label>

						<label>
							Notes
							<input
								name="notes"
								placeholder="notes (optional)"
								value={drafts[activeToken.id]?.createNotes ?? ''}
								oninput={(event) =>
									updateDraft(activeToken.id, 'createNotes', (event.currentTarget as HTMLInputElement).value)}
							/>
						</label>

						<button type="submit" disabled={createState[activeToken.id] === 'saving'}>
							{#if createState[activeToken.id] === 'saving'}
								Saving...
							{:else if drafts[activeToken.id]?.selectedWordId}
								Update + link
							{:else}
								Create + link
							{/if}
						</button>
					</form>
				</div>
			</div>
		</div>
	{/if}

	{#if pendingMerge}
		<div class="modal-backdrop" role="presentation">
			<div class="picker-modal merge-modal" role="dialog" aria-modal="true" aria-label="Confirm word merge">
				<strong>Combine words?</strong>
				<p class="status-text">
					Combine "{pendingMerge.sourceSurface}" and "{pendingMerge.targetSurface}" into one word group?
				</p>
				<div class="inline-actions">
					<button bind:this={mergeConfirmButton} type="button" onclick={() => void confirmMerge()}>
						Combine words
					</button>
					<button type="button" class="secondary-button" onclick={() => (pendingMerge = null)}>Cancel</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.annotations {
		align-items: flex-start;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.5rem;
	}

	.empty-text {
		margin: 0;
	}

	.token-group {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.15rem;
	}

	.token-card {
		align-items: stretch;
		background: #fff;
		border: 0;
		display: grid;
		gap: 0.15rem;
		grid-template-rows: auto auto auto;
		min-width: 0;
		padding: 0;
		width: auto;
	}

	.lemma-label {
		border-radius: 4px;
		color: #555;
		font-size: 0.75rem;
		line-height: 1.1;
		min-height: 0.9rem;
		padding: 0.05rem 0.2rem;
		text-align: center;
	}

	.unlinked-lemma {
		background: #fff1f2;
	}

	.unlinked-marker {
		align-self: center;
		border-top: 2px solid #c2410c;
		display: inline-block;
		width: 10px;
	}

	.token-button {
		background: transparent;
		border: 0;
		border-bottom: 1px solid #f4c88a;
		border-radius: 0;
		font: inherit;
		font-weight: 600;
		padding: 0.1rem 0.2rem;
		text-align: center;
		white-space: nowrap;
	}

	.token-button--dragging {
		opacity: 0.55;
	}

	.token-edit-input {
		border: 1px solid #d0d7de;
		font: inherit;
		font-weight: 600;
		padding: 0.15rem 0.25rem;
		text-align: center;
	}

	.translation-form {
		display: grid;
		gap: 0.15rem;
	}

	.translation-form input {
		font-size: 0.8rem;
		min-width: 25px;
		padding: 0.2rem 0.3rem;
		text-align: center;
		width: auto;
	}

	.meaning-input {
		background: transparent;
		border: 0;
		transition: background-color 340ms ease;
	}

	.meaning-input--empty {
		background: #e5e7eb;
		border-radius: 4px;
	}

	.meaning-input--saving {
		background: #fef3c7;
		border-radius: 4px;
	}

	.meaning-input--saved {
		background: #dcfce7;
		border-radius: 4px;
	}

	.modal-backdrop {
		align-items: center;
		background: rgba(15, 23, 42, 0.3);
		display: flex;
		inset: 0;
		justify-content: center;
		padding: 1rem;
		position: fixed;
		z-index: 40;
	}

	.picker-modal {
		background: white;
		border: 1px solid #d0d7de;
		box-shadow: 0 10px 30px rgba(15, 23, 42, 0.15);
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem;
		width: min(480px, calc(100vw - 2rem));
	}

	.merge-modal {
		width: min(360px, calc(100vw - 2rem));
	}

	.picker-header {
		align-items: center;
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.results-list {
		display: flex;
		gap: 0.35rem;
		max-height: 240px;
		overflow-x: auto;
		overflow-y: hidden;
	}

	.results-list form {
		flex: 0 0 auto;
		margin: 0;
	}

	.result-button {
		align-items: start;
		background: #fff;
		border: 1px solid #e2e2e2;
		display: grid;
		gap: 0.15rem;
		grid-template-columns: 1fr;
		min-width: 120px;
		max-width: 145px;
		padding: 0.5rem 0.6rem;
		text-align: left;
		width: 100%;
	}

	.result-lemma {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.result-translations {
		color: #666;
		display: block;
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.selected-result {
		border-color: #2563eb;
		box-shadow: 0 0 0 1px #2563eb;
	}

	.create-box {
		border-top: 1px solid #eee;
		display: grid;
		gap: 0.35rem;
		padding-top: 0.5rem;
	}

	.editor-header,
	.editor-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: space-between;
	}

	.create-form {
		display: grid;
		gap: 0.5rem;
	}

	.lemma-row {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	}

	.status-text {
		color: #555;
		margin: 0;
	}

	label {
		display: grid;
		gap: 0.25rem;
	}

	input,
	button {
		font: inherit;
		padding: 0.4rem 0.45rem;
	}

	.secondary-button {
		background: #fff;
		border: 1px solid #d0d0d0;
	}

	.error-text {
		color: #8c1c13;
	}
</style>
