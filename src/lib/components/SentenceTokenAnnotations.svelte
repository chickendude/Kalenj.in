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
		segments?: TokenSegment[];
	};

	type TokenSegment = {
		id: string;
		segmentOrder: number;
		segmentStart: number;
		segmentEnd: number;
		surfaceForm: string;
		wordId: string | null;
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
		segments?: TokenSegment[];
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
		tokenGroupEndpoint,
		onTokensChange
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
		onTokensChange?: (tokens: SentenceToken[]) => void;
	} = $props();

	let openTokenId = $state<string | null>(null);
	let activeSegmentId = $state<string | null>(null);
	let searchQuery = $state('');
	let searchResults = $state<SearchResult[]>([]);
	let searchLoading = $state(false);
	let searchError = $state<string | null>(null);
	let searchResultCache = $state<Record<string, SearchResult[]>>({});
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
	let splitMarkers = $state<Record<string, number[]>>({});
	let hoveredSplitMarker = $state<number | null>(null);
	const autoSaveTimers = new Map<string, number>();

		const groups = $derived(
			groupSentenceTokens({
				sentenceId,
				tokens: localTokens
			})
		);
	const activeToken = $derived(localTokens.find((token) => token.id === openTokenId) ?? null);
	const activeGroup = $derived(groups.find((group) => group.tokens[0]?.id === openTokenId) ?? null);
	const activeSegment = $derived(
		activeToken?.segments?.find((segment) => segment.id === activeSegmentId) ?? null
	);
	const splitTabSegments = $derived(activeToken?.segments ?? []);
	const activeDraftKey = $derived(activeSegment?.id ?? activeToken?.id ?? '');
	const activeSurface = $derived(activeSegment?.surfaceForm ?? activeGroup?.fullSurface ?? '');
	const activeWord = $derived(activeSegment?.word ?? activeToken?.word ?? null);
	const activeWordId = $derived(activeSegment?.wordId ?? activeToken?.wordId ?? null);
	const isFirstSegmentActive = $derived(
		Boolean(activeToken?.segments?.[0]?.id && activeToken.segments[0].id === activeSegment?.id)
	);

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
				wordSpellings: token.word?.spellings?.map((spelling) => spelling.spelling) ?? [],
				segments:
					token.segments?.map((segment) => ({
						id: segment.id,
						surfaceForm: segment.surfaceForm,
						wordId: segment.wordId,
						wordKalenjin: segment.word?.kalenjin ?? null,
						wordTranslations: segment.word?.translations ?? null,
						wordNotes: segment.word?.notes ?? null,
						wordSpellings: segment.word?.spellings?.map((spelling) => spelling.spelling) ?? []
					})) ?? []
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

			for (const segment of token.segments ?? []) {
				drafts[segment.id] = {
					inContextTranslation: '',
					selectedWordId: segment.word?.id ?? '',
					createLemma: segment.word?.kalenjin ?? normalizeSearchQuery(segment.surfaceForm),
					createTranslations: segment.word?.translations ?? '',
					createNotes: segment.word?.notes ?? '',
					createAlternativeSpellings: serializeSpellings(segment.word?.spellings)
				};
			}
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

		if (Object.prototype.hasOwnProperty.call(searchResultCache, currentQuery)) {
			searchResults = searchResultCache[currentQuery];
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
				searchResultCache = {
					...searchResultCache,
					[currentQuery]: searchResults
				};
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

	function activatePickerToken(token: SentenceToken, segmentId: string | null = null) {
		openTokenId = token.id;
		const segment = token.segments?.find((entry) => entry.id === segmentId) ?? null;
		activeSegmentId = segment?.id ?? null;
		searchQuery = normalizeSearchQuery(segment?.word?.kalenjin ?? segment?.surfaceForm ?? token.word?.kalenjin ?? token.surfaceForm);
		searchResults = [];
		searchError = null;
		groupActionError = null;
		hoveredSplitMarker = null;
	}

	function openPicker(token: SentenceToken) {
		activatePickerToken(token, token.segments?.[0]?.id ?? null);
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
		activeSegmentId = null;
		groupActionError = null;
		hoveredSplitMarker = null;
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
		const draftKey = activeSegment?.id ?? token.id;
		drafts[draftKey] = {
			...drafts[draftKey],
			selectedWordId: '',
			createLemma: normalizeSearchQuery(activeSegment?.surfaceForm ?? token.surfaceForm),
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
		onTokensChange?.(localTokens);
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

	function defaultSplitMarkersFor(tokenId: string): number[] {
		const token = localTokens.find((entry) => entry.id === tokenId);
		const segments = token?.segments ?? [];
		if (segments.length < 2) {
			return [];
		}

		return segments.slice(0, -1).map((segment) => segment.segmentEnd);
	}

	function splitMarkersFor(tokenId: string): number[] {
		return Object.prototype.hasOwnProperty.call(splitMarkers, tokenId)
			? splitMarkers[tokenId]
			: defaultSplitMarkersFor(tokenId);
	}

	function toggleSplitMarker(tokenId: string, boundary: number, surface: string): void {
		if (boundary <= 0 || boundary >= surface.length) {
			return;
		}

		const currentMarkers = splitMarkersFor(tokenId);
		splitMarkers[tokenId] = currentMarkers.includes(boundary)
			? currentMarkers.filter((value) => value !== boundary)
			: [...currentMarkers, boundary].sort((a, b) => a - b);
	}

	function splitPreview(surface: string, tokenId: string): string {
		const boundaries = [...splitMarkersFor(tokenId)];
		if (
			hoveredSplitMarker !== null &&
			hoveredSplitMarker > 0 &&
			hoveredSplitMarker < surface.length &&
			!boundaries.includes(hoveredSplitMarker)
		) {
			boundaries.push(hoveredSplitMarker);
		}

		const points = boundaries.sort((a, b) => a - b);
		let output = '';
		for (let index = 0; index < surface.length; index += 1) {
			output += surface[index];
			if (points.includes(index + 1)) {
				output += '|';
			}
		}

		return output;
	}

	function nextSplitSegment(currentSegmentId: string | null): TokenSegment | null {
		if (!openTokenId || !currentSegmentId) {
			return null;
		}

		const currentToken = localTokens.find((token) => token.id === openTokenId);
		return (
			currentToken?.segments?.find(
				(segment) => segment.id !== currentSegmentId && !segment.wordId
			) ?? null
		);
	}

	async function splitActiveGroup(splitPoints?: number[]) {
		if (!activeGroup || !activeToken) {
			return;
		}

		if (!splitPoints && !window.confirm(`Split "${activeToken.surfaceForm}" into separate words?`)) {
			return;
		}

		try {
			const originalTokenId = activeToken.id;
			const originalSurface = activeToken.surfaceForm;
			const isLexicalSplit = Boolean(splitPoints);
			const nextTokens = await requestGroupAction({
				action: isLexicalSplit ? 'segments' : 'split',
				tokenId: originalTokenId,
				...(splitPoints ? { splitPoints } : {})
			});
			const nextSplitMarkers = { ...splitMarkers };
			delete nextSplitMarkers[originalTokenId];
			splitMarkers = nextSplitMarkers;
			hoveredSplitMarker = null;
			editingSurfaceTokenId = null;
			surfaceDraft = '';
			const updatedToken = nextTokens.find((token) => token.id === originalTokenId);
			if (isLexicalSplit && updatedToken?.segments?.[0]) {
				activatePickerToken(updatedToken, updatedToken.segments[0].id);
			} else if (!isLexicalSplit) {
				closePicker();
				if (nextTokens.length > 0) {
					focusMeaningInput(nextTokens[0].id);
				}
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
					const nextSegment = nextSplitSegment(activeSegmentId);
					const updatedActiveToken = localTokens.find((token) => token.id === tokenId);
					if (nextSegment && updatedActiveToken) {
						activatePickerToken(updatedActiveToken, nextSegment.id);
					} else {
						closePicker();
					}
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
							word: tokenUpdate.word ?? null,
							segments: tokenUpdate.segments ?? token.segments
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

			for (const segment of tokenUpdate.segments ?? []) {
				drafts[segment.id] = {
					...drafts[segment.id],
					inContextTranslation: '',
					selectedWordId: segment.word?.id ?? '',
					createLemma:
						segment.word?.kalenjin ??
						drafts[segment.id]?.createLemma ??
						normalizeSearchQuery(segment.surfaceForm),
					createTranslations: segment.word?.translations ?? drafts[segment.id]?.createTranslations ?? '',
					createNotes: segment.word?.notes ?? drafts[segment.id]?.createNotes ?? '',
					createAlternativeSpellings: segment.word?.spellings
						? serializeSpellings(segment.word.spellings)
						: drafts[segment.id]?.createAlternativeSpellings ?? ''
				};
			}
		}
		onTokensChange?.(localTokens);
	}
</script>

<div class="annotations">
	{#if groups.length === 0}
		<p class="empty-text">{sentenceText}</p>
	{:else}
		{#each groups as group (group.key)}
			{@const primaryToken = group.tokens[0]}
			{@const sharedWord = primaryToken.word}
			{@const lexicalSegments = primaryToken.segments ?? []}
			{@const meaningValue = drafts[primaryToken.id]?.inContextTranslation ?? ''}
			<div class="token-group">
				<div class="token-card">
					<div class:unlinked-lemma={!sharedWord && lexicalSegments.length === 0} class="lemma-label">
						{#if lexicalSegments.length > 0}
							{#each lexicalSegments as segment, segmentIndex}
								{#if segmentIndex > 0}<span class="segment-divider">+</span>{/if}
								<span class:unlinked-segment={!segment.word}>{segment.word?.kalenjin ?? segment.surfaceForm}</span>
							{/each}
						{:else if sharedWord}
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

				{#if splitTabSegments.length > 1}
					<div class="split-tabs" role="tablist" aria-label="Split word parts">
						{#each splitTabSegments as tabSegment, tabIndex}
							<button
								type="button"
								role="tab"
								class="split-tab"
								class:active={tabSegment.id === activeSegment?.id}
								aria-selected={tabSegment.id === activeSegment?.id}
								onclick={() => activatePickerToken(activeToken, tabSegment.id)}
							>
								<span>{tabSegment.surfaceForm}</span>
								<small>{tabSegment.word?.kalenjin ?? `Part ${tabIndex + 1}`}</small>
							</button>
						{/each}
					</div>
				{/if}

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
							handleSearchInput(activeDraftKey, (event.currentTarget as HTMLInputElement).value)}
					/>
				</label>

				<div class="results-list">
					{#if searchError}
						<p class="status-text error-text">{searchError}</p>
					{:else if searchLoading}
						<div class="loading-placeholder" aria-live="polite" aria-label="Searching">
							<span class="loading-spinner" aria-hidden="true"></span>
						</div>
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
								{#if activeSegment}
									<input type="hidden" name="segmentId" value={activeSegment.id} />
								{/if}
								<input type="hidden" name="wordId" value={result.id} />
								<input
									type="hidden"
									name="inContextTranslation"
									value={drafts[activeToken.id]?.inContextTranslation ?? ''}
								/>
								<button
									type="submit"
									class="result-button"
									class:selected-result={activeWordId === result.id}
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
						<strong>{drafts[activeDraftKey]?.selectedWordId ? 'Update lemma' : 'Create new lemma'}</strong>
						<div class="editor-actions">
							{#if activeWordId}
								<form
									method="POST"
									action={updateAction}
									use:enhance={enhanceUpdateForm(activeToken.id, {
										closeOnSuccess: !activeSegment,
										invalidateOnSuccess: true
									})}
								>
									<input type="hidden" name={entityIdField} value={entityId} />
									<input type="hidden" name="tokenId" value={activeToken.id} />
									{#if activeSegment}
										<input type="hidden" name="segmentId" value={activeSegment.id} />
									{/if}
									<input type="hidden" name="wordId" value="" />
									<input
										type="hidden"
										name="inContextTranslation"
										value={drafts[activeToken.id]?.inContextTranslation ?? ''}
									/>
									<button type="submit" class="secondary-button">Clear lemma</button>
								</form>
							{/if}

							{#if drafts[activeDraftKey]?.selectedWordId}
								<button
									type="button"
									class="secondary-button"
									onclick={() => resetEditorToCreate(activeToken)}
								>
									New lemma
								</button>
							{/if}

							{#if !activeSegment && activeToken.surfaceForm.trim().includes(' ')}
								<button type="button" class="secondary-button" onclick={() => void splitActiveGroup()}>
									Split spaces
								</button>
							{/if}
						</div>
					</div>

					{#if (!activeSegment || isFirstSegmentActive) && activeToken.surfaceForm.length > 1}
						<div class="split-box">
							<div class="editor-header">
								<strong>{activeToken.segments?.length ? 'Edit split' : 'Split written word'}</strong>
								<button
									type="button"
									class="secondary-button"
									disabled={splitMarkersFor(activeToken.id).length === 0}
									onclick={() => void splitActiveGroup([...splitMarkersFor(activeToken.id)])}
								>
									Apply split
								</button>
							</div>
							<div class="word-editor" aria-label={`Split ${activeToken.surfaceForm}`}>
								{#each Array.from(activeToken.surfaceForm) as char, index}
									<button
										type="button"
										class="letter-char"
										onclick={() =>
											index < activeToken.surfaceForm.length - 1
												? toggleSplitMarker(activeToken.id, index + 1, activeToken.surfaceForm)
												: null}
										onmouseenter={() =>
											(hoveredSplitMarker =
												index < activeToken.surfaceForm.length - 1 ? index + 1 : null)}
										onmouseleave={() => (hoveredSplitMarker = null)}
										aria-label={`Split after ${char}`}
									>
										{char}
									</button>
									{#if index < activeToken.surfaceForm.length - 1}
										<span
											class="marker-inline"
											class:active={splitMarkersFor(activeToken.id).includes(index + 1)}
											class:hovered={hoveredSplitMarker === index + 1}
										>
											|
										</span>
									{/if}
								{/each}
							</div>
							<small class="status-text split-preview">
								{splitPreview(activeToken.surfaceForm, activeToken.id)}
							</small>
						</div>
					{/if}

					<form
						method="POST"
						action={createAction}
						class="create-form"
						use:enhance={enhanceCreateForm(activeToken.id)}
					>
						<input type="hidden" name={entityIdField} value={entityId} />
						<input type="hidden" name="tokenId" value={activeToken.id} />
						{#if activeSegment}
							<input type="hidden" name="segmentId" value={activeSegment.id} />
						{/if}
						<input type="hidden" name="wordId" value={drafts[activeDraftKey]?.selectedWordId ?? ''} />
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
									value={drafts[activeDraftKey]?.createLemma ?? activeSurface}
									oninput={(event) =>
										updateDraft(activeDraftKey, 'createLemma', (event.currentTarget as HTMLInputElement).value)}
								/>
							</label>

							<label>
								Alternative spellings
								<input
									name="alternativeSpellings"
									placeholder="alt1, alt2"
									value={drafts[activeDraftKey]?.createAlternativeSpellings ?? ''}
									oninput={(event) =>
										updateDraft(
											activeDraftKey,
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
								value={drafts[activeDraftKey]?.createTranslations ?? ''}
								oninput={(event) =>
									updateDraft(activeDraftKey, 'createTranslations', (event.currentTarget as HTMLInputElement).value)}
							/>
						</label>

						<label>
							Notes
							<input
								name="notes"
								placeholder="notes (optional)"
								value={drafts[activeDraftKey]?.createNotes ?? ''}
								oninput={(event) =>
									updateDraft(activeDraftKey, 'createNotes', (event.currentTarget as HTMLInputElement).value)}
							/>
						</label>

						<button type="submit" disabled={createState[activeToken.id] === 'saving'}>
							{#if createState[activeToken.id] === 'saving'}
								Saving...
							{:else if drafts[activeDraftKey]?.selectedWordId}
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
		background: var(--paper);
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
		color: var(--ink-soft);
		font-size: 0.75rem;
		line-height: 1.1;
		min-height: 0.9rem;
		padding: 0.05rem 0.2rem;
		text-align: center;
	}

	.unlinked-lemma {
		background: var(--danger-soft);
	}

	.unlinked-marker {
		align-self: center;
		border-top: 2px solid var(--danger-strong);
		display: inline-block;
		width: 10px;
	}

	.segment-divider {
		color: var(--ink-mute);
		margin: 0 0.15rem;
	}

	.unlinked-segment {
		color: var(--danger-strong);
	}

	.token-button {
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--warning);
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
		border: 1px solid var(--line);
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
		background: var(--surface);
		border-radius: 4px;
	}

	.meaning-input--saving {
		background: var(--warning-soft);
		border-radius: 4px;
	}

	.meaning-input--saved {
		background: var(--success-soft);
		border-radius: 4px;
	}

	.modal-backdrop {
		align-items: center;
		background: var(--scrim);
		display: flex;
		inset: 0;
		justify-content: center;
		padding: 1rem;
		position: fixed;
		z-index: 40;
	}

	.picker-modal {
		background: var(--paper);
		border: 1px solid var(--line);
		box-shadow: var(--shadow-md);
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

	.split-tabs {
		border-bottom: 1px solid var(--line-soft);
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
		padding-bottom: 0.5rem;
	}

	.split-tab {
		align-items: start;
		background: var(--paper);
		border: 1px solid var(--line);
		display: grid;
		gap: 0.1rem;
		min-width: 78px;
		padding: 0.35rem 0.45rem;
		text-align: left;
	}

	.split-tab.active {
		border-color: var(--info);
		box-shadow: 0 0 0 1px var(--info);
	}

	.split-tab span {
		font-weight: 700;
	}

	.split-tab small {
		color: var(--ink-soft);
		line-height: 1.15;
	}

	.results-list {
		align-items: stretch;
		display: flex;
		gap: 0.35rem;
		height: 76px;
		overflow-x: auto;
		overflow-y: hidden;
	}

	.results-list form {
		flex: 0 0 auto;
		margin: 0;
	}

	.results-list > .status-text {
		align-self: center;
	}

	.loading-placeholder {
		align-items: center;
		display: flex;
		height: 100%;
		justify-content: center;
		min-width: 42px;
	}

	.loading-spinner {
		animation: spin 720ms linear infinite;
		border: 2px solid var(--info-soft);
		border-top-color: var(--info);
		border-radius: 999px;
		display: inline-block;
		height: 18px;
		width: 18px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.result-button {
		align-items: start;
		background: var(--paper);
		border: 1px solid var(--line);
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
		color: var(--ink-soft);
		display: block;
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.selected-result {
		border-color: var(--info);
		box-shadow: 0 0 0 1px var(--info);
	}

	.create-box {
		border-top: 1px solid var(--line-soft);
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

	.split-box {
		border-top: 1px solid var(--line-soft);
		display: grid;
		gap: 0.35rem;
		padding-top: 0.5rem;
	}

	.word-editor {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
	}

	.letter-char {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 600;
		padding: 0;
	}

	.marker-inline {
		color: var(--ink-mute);
		font-weight: 700;
		margin: 0 0.1rem;
	}

	.marker-inline.active {
		color: var(--success);
	}

	.marker-inline.hovered {
		color: var(--info);
	}

	.split-preview {
		font-family: var(--font-display, inherit);
	}

	.lemma-row {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	}

	.status-text {
		color: var(--ink-soft);
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
		background: var(--paper);
		border: 1px solid var(--border-strong);
	}

	.error-text {
		color: var(--danger);
	}
</style>
