<script lang="ts">
	import { enhance } from '$app/forms';
	import { groupSentenceTokens } from '$lib/word-groups';
	import { PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import { stripWordLinks } from '$lib/word-links';
	import ImageUploadField from './ImageUploadField.svelte';
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
			partOfSpeech?: PartOfSpeech | null;
			pluralForm?: string | null;
			imageUrl?: string | null;
			isPluralOnly?: boolean | null;
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
			partOfSpeech?: PartOfSpeech | null;
			pluralForm?: string | null;
			imageUrl?: string | null;
			isPluralOnly?: boolean | null;
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
		createPluralForm: string;
		createIsPluralOnly: boolean;
		createPartOfSpeech: PartOfSpeech | '';
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
			partOfSpeech?: PartOfSpeech | null;
			pluralForm?: string | null;
			isPluralOnly?: boolean | null;
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
		onTokensChange,
		onNavigatePrevSentence,
		onNavigateNextSentence,
		focusRequest
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
		onNavigatePrevSentence?: () => void;
		onNavigateNextSentence?: () => void;
		focusRequest?: { position: 'first' | 'last'; nonce: number } | null;
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
	let posOtherOpen = $state(false);
	let posOtherWrap = $state<HTMLDivElement | null>(null);
	const autoSaveTimers = new Map<string, number>();

		const groups = $derived(
			groupSentenceTokens({
				sentenceId,
				tokens: localTokens
			})
		);
	const activeToken = $derived(localTokens.find((token) => token.id === openTokenId) ?? null);
	const activeGroup = $derived(groups.find((group) => group.tokens[0]?.id === openTokenId) ?? null);
	const activeGroupIndex = $derived(
		activeGroup ? groups.findIndex((group) => group.key === activeGroup.key) : -1
	);
	const hasPrevWord = $derived(
		activeGroupIndex > 0 || (activeGroupIndex === 0 && Boolean(onNavigatePrevSentence))
	);
	const hasNextWord = $derived(
		(activeGroupIndex >= 0 && activeGroupIndex < groups.length - 1) ||
			(activeGroupIndex === groups.length - 1 && Boolean(onNavigateNextSentence))
	);
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

	function stripSurroundingPunctuation(value: string): string {
		return value
			.replace(/^[^\p{L}\p{M}\p{N}]+/u, '')
			.replace(/[^\p{L}\p{M}\p{N}]+$/u, '');
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
				wordTranslations: token.word?.translations ? stripWordLinks(token.word.translations) : null,
				wordNotes: token.word?.notes ? stripWordLinks(token.word.notes) : null,
				wordSpellings: token.word?.spellings?.map((spelling) => spelling.spelling) ?? [],
				segments:
					token.segments?.map((segment) => ({
						id: segment.id,
						surfaceForm: segment.surfaceForm,
						wordId: segment.wordId,
						wordKalenjin: segment.word?.kalenjin ?? null,
						wordTranslations: segment.word?.translations ? stripWordLinks(segment.word.translations) : null,
						wordNotes: segment.word?.notes ? stripWordLinks(segment.word.notes) : null,
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
				createTranslations: stripWordLinks(token.word?.translations ?? ''),
				createNotes: stripWordLinks(token.word?.notes ?? ''),
				createAlternativeSpellings: serializeSpellings(token.word?.spellings),
				createPluralForm: token.word?.pluralForm ?? '',
				createIsPluralOnly: Boolean(token.word?.isPluralOnly),
				createPartOfSpeech: token.word?.partOfSpeech ?? ''
			};

			for (const segment of token.segments ?? []) {
				drafts[segment.id] = {
					inContextTranslation: '',
					selectedWordId: segment.word?.id ?? '',
					createLemma: segment.word?.kalenjin ?? normalizeSearchQuery(segment.surfaceForm),
					createTranslations: stripWordLinks(segment.word?.translations ?? ''),
					createNotes: stripWordLinks(segment.word?.notes ?? ''),
					createAlternativeSpellings: serializeSpellings(segment.word?.spellings),
					createPluralForm: segment.word?.pluralForm ?? '',
					createIsPluralOnly: Boolean(segment.word?.isPluralOnly),
					createPartOfSpeech: segment.word?.partOfSpeech ?? ''
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

	let lastFocusRequestNonce = $state<number | null>(null);
	$effect(() => {
		if (!focusRequest) {
			return;
		}
		if (focusRequest.nonce === lastFocusRequestNonce) {
			return;
		}
		lastFocusRequestNonce = focusRequest.nonce;
		const target =
			focusRequest.position === 'first'
				? groups[0]?.tokens[0]
				: groups[groups.length - 1]?.tokens[0];
		if (target) {
			openPicker(target);
		}
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

	$effect(() => {
		if (!posOtherOpen) {
			return;
		}

		function handlePointerDown(event: MouseEvent) {
			const wrap = posOtherWrap;
			if (!wrap) {
				return;
			}

			const target = event.target;
			if (target instanceof Node && wrap.contains(target)) {
				return;
			}

			posOtherOpen = false;
		}

		window.addEventListener('pointerdown', handlePointerDown, true);
		return () => window.removeEventListener('pointerdown', handlePointerDown, true);
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
		posOtherOpen = false;
	}

	function openPicker(token: SentenceToken) {
		activatePickerToken(token, token.segments?.[0]?.id ?? null);
	}

	function gotoAdjacentWord(delta: 1 | -1) {
		if (activeGroupIndex < 0) {
			return;
		}
		const target = groups[activeGroupIndex + delta];
		const nextToken = target?.tokens[0];
		if (nextToken) {
			openPicker(nextToken);
			return;
		}
		const beyondHandler = delta === 1 ? onNavigateNextSentence : onNavigatePrevSentence;
		if (beyondHandler) {
			closePicker();
			beyondHandler();
		}
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

		if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
			event.preventDefault();
			event.stopPropagation();
			gotoAdjacentWord(event.key === 'ArrowRight' ? 1 : -1);
			return;
		}

		event.stopPropagation();
	}

	function updateDraft<K extends keyof TokenDraft>(tokenId: string, field: K, value: TokenDraft[K]) {
		drafts[tokenId] = {
			...drafts[tokenId],
			[field]: value
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
		const pending = splitMarkers[tokenId];
		return pending !== undefined ? pending : defaultSplitMarkersFor(tokenId);
	}

	async function applySplitClick(tokenId: string, boundary: number, surface: string): Promise<void> {
		if (boundary <= 0 || boundary >= surface.length) {
			return;
		}

		const currentMarkers = splitMarkersFor(tokenId);
		const nextMarkers = currentMarkers.includes(boundary)
			? currentMarkers.filter((value) => value !== boundary)
			: [...currentMarkers, boundary].sort((a, b) => a - b);

		// Optimistic UI update so the click feels instantaneous while the
		// server persists the new split.
		splitMarkers[tokenId] = nextMarkers;
		hoveredSplitMarker = null;

		try {
			if (nextMarkers.length === 0) {
				await unsplitActiveGroup();
			} else {
				await splitActiveGroup(nextMarkers);
			}
		} catch {
			// Roll back optimistic state on failure. splitActiveGroup already
			// surfaces the error message via groupActionError.
			const revert = { ...splitMarkers };
			delete revert[tokenId];
			splitMarkers = revert;
		}
	}

	async function unsplitActiveGroup(): Promise<void> {
		if (!activeToken) {
			return;
		}

		const originalTokenId = activeToken.id;

		try {
			await requestGroupAction({
				action: 'unsplit',
				tokenId: originalTokenId
			});
			const nextSplitMarkers = { ...splitMarkers };
			delete nextSplitMarkers[originalTokenId];
			splitMarkers = nextSplitMarkers;
			hoveredSplitMarker = null;
			activeSegmentId = null;
		} catch (unsplitError) {
			groupActionError =
				unsplitError instanceof Error ? unsplitError.message : 'Could not unsplit this word.';
			throw unsplitError;
		}
	}

	type SplitPart = { text: string; start: number; end: number };

	function computeSplitParts(text: string, splits: number[]): SplitPart[] {
		const bounds = [0, ...splits, text.length];
		const parts: SplitPart[] = [];
		for (let i = 0; i < bounds.length - 1; i += 1) {
			const start = bounds[i];
			const end = bounds[i + 1];
			if (end > start) {
				parts.push({ text: text.slice(start, end), start, end });
			}
		}
		return parts;
	}

	function partIndexForChar(charIndex: number, splits: number[]): number {
		let idx = 0;
		for (const sp of splits) {
			if (sp <= charIndex) {
				idx += 1;
			}
		}
		return idx;
	}

	function activeSegmentIndex(
		token: SentenceToken | null,
		segment: TokenSegment | null
	): number {
		if (!token || !segment) return -1;
		return token.segments?.findIndex((entry) => entry.id === segment.id) ?? -1;
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
					(tokenUpdate.word?.translations ? stripWordLinks(tokenUpdate.word.translations) : undefined) ??
					drafts[tokenUpdate.tokenId]?.createTranslations ??
					'',
				createNotes:
					(tokenUpdate.word?.notes ? stripWordLinks(tokenUpdate.word.notes) : undefined) ??
					drafts[tokenUpdate.tokenId]?.createNotes ??
					'',
				createAlternativeSpellings:
					tokenUpdate.word?.spellings
						? serializeSpellings(tokenUpdate.word.spellings)
						: drafts[tokenUpdate.tokenId]?.createAlternativeSpellings ?? '',
				createPluralForm:
					tokenUpdate.word?.pluralForm ?? drafts[tokenUpdate.tokenId]?.createPluralForm ?? '',
				createIsPluralOnly:
					tokenUpdate.word?.isPluralOnly ?? drafts[tokenUpdate.tokenId]?.createIsPluralOnly ?? false,
				createPartOfSpeech:
					tokenUpdate.word?.partOfSpeech ?? drafts[tokenUpdate.tokenId]?.createPartOfSpeech ?? ''
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
					createTranslations:
						(segment.word?.translations ? stripWordLinks(segment.word.translations) : undefined) ??
						drafts[segment.id]?.createTranslations ??
						'',
					createNotes:
						(segment.word?.notes ? stripWordLinks(segment.word.notes) : undefined) ??
						drafts[segment.id]?.createNotes ??
						'',
					createAlternativeSpellings: segment.word?.spellings
						? serializeSpellings(segment.word.spellings)
						: drafts[segment.id]?.createAlternativeSpellings ?? '',
					createPluralForm:
						segment.word?.pluralForm ?? drafts[segment.id]?.createPluralForm ?? '',
					createIsPluralOnly:
						segment.word?.isPluralOnly ?? drafts[segment.id]?.createIsPluralOnly ?? false,
					createPartOfSpeech:
						segment.word?.partOfSpeech ?? drafts[segment.id]?.createPartOfSpeech ?? ''
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
		{@const pendingSplits = splitMarkersFor(activeToken.id)}
		{@const previewParts = computeSplitParts(activeToken.surfaceForm, pendingSplits)}
		{@const hasCommittedSegments = splitTabSegments.length > 1}
		{@const activeSegIdx = activeSegmentIndex(activeToken, activeSegment)}
		{@const activeSurfaceTrim = (activeSurface ?? '').trim()}
		{@const createLemmaValue =
			drafts[activeDraftKey]?.createLemma ?? activeSurface ?? ''}
		{@const createTranslationsValue = drafts[activeDraftKey]?.createTranslations ?? ''}
		{@const selectedWordInDraft = drafts[activeDraftKey]?.selectedWordId ?? ''}
		{@const canSubmitCreate =
			createLemmaValue.trim().length > 0 && createTranslationsValue.trim().length > 0}
		{@const currentPos = drafts[activeDraftKey]?.createPartOfSpeech ?? ''}
		{@const otherSelected =
			currentPos !== '' && !(CORE_POS as readonly string[]).includes(currentPos)}
		{@const currentPosNeedsPlural = currentPos === 'NOUN' || currentPos === 'ADJECTIVE'}
		{@const pluralFormValue = drafts[activeDraftKey]?.createPluralForm ?? ''}
		{@const isPluralOnlyValue = drafts[activeDraftKey]?.createIsPluralOnly ?? false}
		{@const splittableSurface = activeToken.surfaceForm.replace(
			/[^\p{L}\p{M}\p{N}]+$/u,
			''
		)}
		<div
			class="modal-backdrop"
			role="button"
			tabindex="0"
			aria-label="Close lemma picker"
			onclick={() => closePicker()}
			onkeydown={handleBackdropKeydown}
		>
			<div
				class="lemma-modal"
				role="dialog"
				aria-modal="true"
				aria-label="Link root lemma"
				tabindex="-1"
				onclick={(event) => event.stopPropagation()}
				onkeydown={handleModalKeydown}
			>
				<!-- Header -->
				<div class="lemma-modal-head">
					<div class="lemma-modal-head-text">
						<div class="lemma-kicker">{sentenceText}</div>
						<h3 class="lemma-modal-title">
							<span class="lemma-token-word">{stripSurroundingPunctuation(
									activeGroup.fullSurface
								)}</span>
							{#if drafts[activeToken.id]?.inContextTranslation?.trim()}
								<span class="lemma-token-gloss">{drafts[activeToken.id].inContextTranslation}</span>
							{/if}
						</h3>
					</div>
					<div class="lemma-modal-head-actions">
						<button
							type="button"
							class="icon-btn"
							aria-label="Previous word"
							title="Previous word (Alt+←)"
							disabled={!hasPrevWord}
							onclick={() => gotoAdjacentWord(-1)}
						>
							‹
						</button>
						<button
							type="button"
							class="icon-btn"
							aria-label="Next word"
							title="Next word (Alt+→)"
							disabled={!hasNextWord}
							onclick={() => gotoAdjacentWord(1)}
						>
							›
						</button>
						<button
							type="button"
							class="icon-btn"
							aria-label="Close"
							onclick={() => closePicker()}
						>
							×
						</button>
					</div>
				</div>

				<!-- Splitter: character-level split control -->
				{#if splittableSurface.length > 1}
					<div class="splitter-block">
						<div class="splitter-row-head">
							<span class="splitter-label">Word parts</span>
							<span class="splitter-hint">
								{#if hasCommittedSegments}
									Linking {splitTabSegments.length} parts separately — click a split to remove
									it.
								{:else}
									Click a letter to split after it (e.g. ka|mama → ka + mama).
								{/if}
							</span>
							{#if hasCommittedSegments}
								<button
									type="button"
									class="btn ghost sm splitter-clear"
									onclick={() => void unsplitActiveGroup()}
								>
									Undo splits
								</button>
							{/if}
						</div>
						<div class="splitter" role="group" aria-label={`Split ${splittableSurface}`}>
							{#each Array.from(splittableSurface) as ch, i}
								{@const partIdx = partIndexForChar(i, pendingSplits)}
								{@const isLast = i === splittableSurface.length - 1}
								{@const hasSplitAfter = !isLast && pendingSplits.includes(i + 1)}
								<button
									type="button"
									class={`splitter-char part-tint-${partIdx % 4}`}
									class:has-split-after={hasSplitAfter}
									data-active={activeSegIdx >= 0 && partIdx === activeSegIdx ? 'true' : 'false'}
									aria-label={isLast
										? `Letter ${ch}`
										: hasSplitAfter
											? `Remove split after "${ch}"`
											: `Split after "${ch}"`}
									disabled={isLast}
									onclick={() =>
										void applySplitClick(
											activeToken.id,
											i + 1,
											activeToken.surfaceForm
										)}
								>
									{ch}
								</button>
								{#if hasSplitAfter}
									<span class="splitter-split-marker" aria-hidden="true"></span>
								{/if}
							{/each}
						</div>

						{#if hasCommittedSegments}
							<div class="part-tabs" role="tablist">
								{#each splitTabSegments as seg, segIdx}
									<button
										type="button"
										role="tab"
										aria-selected={seg.id === activeSegment?.id}
										class={`part-tab part-tint-${segIdx % 4}`}
										class:active={seg.id === activeSegment?.id}
										onclick={() => activatePickerToken(activeToken, seg.id)}
									>
										<span class="part-tab-num">Part {segIdx + 1}</span>
										<span class="part-tab-word">{seg.surfaceForm}</span>
										{#if seg.word}
											<span class="part-tab-mark">●</span>
										{/if}
									</button>
								{/each}
							</div>
						{:else if previewParts.length > 1}
							<div class="part-tabs part-tabs-preview" aria-label="Preview of split parts">
								{#each previewParts as p, i}
									<div class={`part-tab part-tint-${i % 4}`}>
										<span class="part-tab-num">Part {i + 1}</span>
										<span class="part-tab-word">{p.text}</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				{#if groupActionError}
					<p class="status-text error-text">{groupActionError}</p>
				{/if}

				<!-- Search + horizontal hit rail -->
				<div class="lemma-search-block">
					<input
						bind:this={searchInput}
						class="input lemma-search-input"
						value={searchQuery}
						placeholder={hasCommittedSegments
							? `Search lemmas for "${activeSurfaceTrim}"…`
							: 'Search existing lemmas…'}
						oninput={(event) =>
							handleSearchInput(activeDraftKey, (event.currentTarget as HTMLInputElement).value)}
					/>
					<div class="lemma-hit-rail" role="list">
						{#if searchError}
							<div class="lemma-hit-empty error-text">{searchError}</div>
						{:else if searchLoading}
							<div class="lemma-hit-empty" aria-live="polite" aria-label="Searching">
								<span class="loading-spinner" aria-hidden="true"></span>
							</div>
						{:else if searchResults.length === 0}
							<div class="lemma-hit-empty">
								{#if searchQuery.trim()}
									No lemmas match "{searchQuery}".
								{:else}
									Type to search existing lemmas.
								{/if}
							</div>
						{:else}
							{#each searchResults as result}
								<form
									method="POST"
									action={updateAction}
									class="lemma-hit-form"
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
										class="lemma-hit"
										class:active={activeWordId === result.id}
										title={`${result.kalenjin} — ${stripWordLinks(result.translations)}`}
									>
										<span class="lemma-hit-word">{result.kalenjin}</span>
										<span class="lemma-hit-gloss">{stripWordLinks(result.translations)}</span>
									</button>
								</form>
							{/each}
						{/if}
					</div>
				</div>

				<!-- Mode switch row -->
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
										updateDraft(
											activeDraftKey,
											'createPartOfSpeech',
											selected ? '' : pos
										);
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
											updateDraft(activeDraftKey, 'createPartOfSpeech', '');
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
													updateDraft(
														activeDraftKey,
														'createPartOfSpeech',
														itemSelected ? '' : pos
													);
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
								href={`/dictionary/${activeWord.id}`}
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
								<button type="submit" class="btn ghost sm">Clear lemma</button>
							</form>
						{/if}
					</div>
				</div>

				<!-- Form -->
				<form
					method="POST"
					action={createAction}
					class="lemma-form"
					enctype="multipart/form-data"
					use:enhance={enhanceCreateForm(activeToken.id)}
				>
					<input type="hidden" name={entityIdField} value={entityId} />
					<input type="hidden" name="tokenId" value={activeToken.id} />
					{#if activeSegment}
						<input type="hidden" name="segmentId" value={activeSegment.id} />
					{/if}
					<input type="hidden" name="wordId" value={selectedWordInDraft} />
					<input
						type="hidden"
						name="inContextTranslation"
						value={drafts[activeToken.id]?.inContextTranslation ?? ''}
					/>
					<input
						type="hidden"
						name="partOfSpeech"
						value={drafts[activeDraftKey]?.createPartOfSpeech ?? ''}
					/>
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
									updateDraft(
										activeDraftKey,
										'createLemma',
										(event.currentTarget as HTMLInputElement).value
									)}
							/>
						</div>
						<div class="field">
							<label for="lemma-field-alt">Alternative spellings</label>
							<input
								id="lemma-field-alt"
								class="input"
								name="alternativeSpellings"
								placeholder="comma, separated"
								value={drafts[activeDraftKey]?.createAlternativeSpellings ?? ''}
								oninput={(event) =>
									updateDraft(
										activeDraftKey,
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
										? 'Nouns need a plural form.'
										: 'Adjectives need a plural form.'}
								</span>
							</div>
							<div class="lemma-forms-grid">
								<div class="field">
									<label for="lemma-field-singular">Singular</label>
									<input
										id="lemma-field-singular"
										class="input"
										value={createLemmaValue}
										readonly
										tabindex="-1"
										aria-readonly="true"
									/>
								</div>
								<div class="field">
									<label for="lemma-field-plural">Plural</label>
									<input
										id="lemma-field-plural"
										class="input"
										placeholder="e.g. chego"
										disabled={isPluralOnlyValue}
										value={pluralFormValue}
										oninput={(event) =>
											updateDraft(
												activeDraftKey,
												'createPluralForm',
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
										updateDraft(
											activeDraftKey,
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
								updateDraft(
									activeDraftKey,
									'createTranslations',
									(event.currentTarget as HTMLInputElement).value
								)}
						/>
					</div>

					<div class="lemma-notes-image-grid">
						<div class="field notes-field">
							<label for="lemma-field-notes">Notes</label>
							<textarea
								id="lemma-field-notes"
								class="input notes-input"
								name="notes"
								placeholder="Optional"
								rows="4"
								value={drafts[activeDraftKey]?.createNotes ?? ''}
								oninput={(event) =>
									updateDraft(
										activeDraftKey,
										'createNotes',
										(event.currentTarget as HTMLTextAreaElement).value
									)}
							></textarea>
						</div>
						<ImageUploadField
							name="image"
							idPrefix="lemma-create-image"
							currentUrl={selectedWordInDraft && selectedWordInDraft === activeWord?.id
								? activeWord?.imageUrl ?? null
								: null}
						/>
					</div>

					<!-- Footer -->
					<div class="lemma-modal-foot">
						<button type="button" class="btn ghost" onclick={() => closePicker()}>Cancel</button>
						<button
							type="submit"
							class="btn"
							disabled={!canSubmitCreate || createState[activeToken.id] === 'saving'}
						>
							{#if createState[activeToken.id] === 'saving'}
								Saving…
							{:else if selectedWordInDraft}
								Update
							{:else}
								Create
							{/if}
						</button>
					</div>
				</form>
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
		align-items: flex-start;
		/* Fixed semi-transparent black so the scrim reads the same in light
		   and dark modes — matches the WOD confirm dialog backdrop on main. */
		background: oklch(0 0 0 / 0.55);
		display: flex;
		inset: 0;
		justify-content: center;
		overflow-y: auto;
		padding: 48px 24px 24px;
		position: fixed;
		z-index: 40;
	}

	/* ---------- Redesigned "Link root lemma" popup ---------- */
	.lemma-modal {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		box-shadow: 0 30px 60px -20px oklch(0.2 0.02 80 / 0.4);
		max-width: 680px;
		padding: 24px 26px 22px;
		width: 100%;
	}

	/* Header */
	.lemma-modal-head {
		align-items: flex-start;
		border-bottom: 1px solid var(--line-soft);
		display: flex;
		gap: 20px;
		justify-content: space-between;
		margin-bottom: 18px;
		padding-bottom: 16px;
	}
	.lemma-modal-head-text {
		min-width: 0;
	}
	.lemma-kicker {
		color: var(--ink-soft);
		font-size: 13px;
		line-height: 1.4;
		margin-bottom: 8px;
	}
	.lemma-modal-title {
		align-items: baseline;
		display: flex;
		flex-wrap: wrap;
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 500;
		gap: 14px;
		letter-spacing: -0.01em;
		margin: 0;
	}
	.lemma-token-word {
		color: var(--ink);
	}
	.lemma-token-gloss {
		color: var(--ink-soft);
		font-family: var(--font-display);
		font-size: 16px;
		font-style: italic;
		font-weight: 400;
	}
	.icon-btn {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: var(--radius);
		color: var(--ink-mute);
		cursor: pointer;
		display: flex;
		flex-shrink: 0;
		font-size: 22px;
		height: 32px;
		justify-content: center;
		line-height: 1;
		padding: 0;
		width: 32px;
	}
	.icon-btn:hover:not(:disabled) {
		background: var(--surface);
		color: var(--ink);
	}
	.icon-btn:disabled {
		cursor: not-allowed;
		opacity: 0.35;
	}
	.lemma-modal-head-actions {
		align-items: center;
		display: flex;
		flex-shrink: 0;
		gap: 2px;
		margin: -4px -6px 0 0;
	}

	/* Splitter */
	.splitter-block {
		background: color-mix(in oklch, var(--surface) 50%, var(--bg-raised));
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		margin-bottom: 18px;
		padding: 14px 16px 12px;
	}
	.splitter-row-head {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-bottom: 12px;
	}
	.splitter-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.splitter-hint {
		color: var(--ink-soft);
		flex: 1;
		font-size: 12px;
		min-width: 0;
	}
	.splitter-hint :global(b) {
		color: var(--ink);
		font-weight: 600;
	}
	.splitter-clear {
		margin-left: auto;
	}
	.splitter {
		align-items: stretch;
		background: var(--bg-raised);
		border: 1px solid var(--line-soft);
		border-radius: var(--radius);
		display: flex;
		gap: 2px;
		overflow-x: auto;
		padding: 8px 6px;
	}
	.splitter-char {
		background: color-mix(in oklch, var(--bg-raised) 80%, transparent);
		border: 0;
		border-right: 2px solid transparent;
		border-radius: 4px;
		color: var(--ink);
		cursor: pointer;
		font-family: var(--font-display);
		font-size: 28px;
		font-weight: 500;
		letter-spacing: 0;
		min-width: 32px;
		padding: 6px 10px;
		text-align: center;
		transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease,
			transform 0.05s ease;
	}
	.splitter .splitter-char:not(:disabled):hover {
		background: color-mix(in oklch, var(--accent) 32%, var(--bg-raised));
		border-right-color: var(--accent);
		color: var(--brand-ink);
	}
	.splitter-char:not(:disabled):active {
		transform: translateY(1px);
	}
	.splitter-char:disabled {
		cursor: default;
	}
	.splitter-char[data-active='true'] {
		color: var(--brand-ink);
	}
	.splitter-split-marker {
		align-self: stretch;
		background-color: transparent;
		background-image: repeating-linear-gradient(
			to bottom,
			var(--accent) 0 4px,
			transparent 4px 7px
		);
		border-radius: 2px;
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 18%, transparent);
		margin: 4px 4px;
		width: 3px;
	}

	/* Part tints */
	.part-tint-0 { --part-c: var(--brand); }
	.part-tint-1 { --part-c: var(--accent); }
	.part-tint-2 { --part-c: oklch(0.5 0.08 220); }
	.part-tint-3 { --part-c: oklch(0.48 0.1 300); }
	.splitter .splitter-char.part-tint-0 {
		background: color-mix(in oklch, var(--brand) 10%, var(--bg-raised));
	}
	.splitter .splitter-char.part-tint-1 {
		background: color-mix(in oklch, var(--accent) 10%, var(--bg-raised));
	}
	.splitter .splitter-char.part-tint-2 {
		background: color-mix(in oklch, oklch(0.5 0.08 220) 10%, var(--bg-raised));
	}
	.splitter .splitter-char.part-tint-3 {
		background: color-mix(in oklch, oklch(0.48 0.1 300) 10%, var(--bg-raised));
	}
	.splitter .splitter-char[data-active='true'].part-tint-0 {
		background: color-mix(in oklch, var(--brand) 22%, var(--bg-raised));
	}
	.splitter .splitter-char[data-active='true'].part-tint-1 {
		background: color-mix(in oklch, var(--accent) 22%, var(--bg-raised));
	}
	.splitter .splitter-char[data-active='true'].part-tint-2 {
		background: color-mix(in oklch, oklch(0.5 0.08 220) 22%, var(--bg-raised));
	}
	.splitter .splitter-char[data-active='true'].part-tint-3 {
		background: color-mix(in oklch, oklch(0.48 0.1 300) 22%, var(--bg-raised));
	}

	.part-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 10px;
	}
	.part-tab {
		align-items: baseline;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-bottom-color: var(--line);
		border-bottom-width: 3px;
		border-radius: var(--radius) var(--radius) 0 0;
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		gap: 8px;
		padding: 8px 12px 7px;
	}
	.part-tabs-preview .part-tab {
		cursor: default;
		opacity: 0.85;
	}
	.part-tab .part-tab-num {
		color: var(--ink-mute);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.part-tab .part-tab-word {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 500;
	}
	.part-tab .part-tab-mark {
		color: var(--part-c, var(--brand));
		font-size: 10px;
	}
	.part-tab:hover {
		border-color: var(--ink-mute);
	}
	.part-tab.active {
		background: var(--bg-raised);
		border-bottom-color: var(--part-c, var(--brand));
	}
	.part-tab.active .part-tab-word {
		color: var(--brand-ink);
	}
	.part-tab.active .part-tab-num {
		color: var(--part-c, var(--brand));
	}

	/* Search + horizontal hit rail */
	.lemma-search-block {
		margin-bottom: 16px;
	}
	.lemma-search-input {
		font-family: var(--font-display);
		font-size: 17px;
		width: 100%;
	}
	.lemma-hit-rail {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding: 10px 2px 8px;
		scrollbar-width: thin;
	}
	.lemma-hit-rail::-webkit-scrollbar { height: 8px; }
	.lemma-hit-rail::-webkit-scrollbar-thumb {
		background: var(--line);
		border-radius: 4px;
	}
	.lemma-hit-form {
		flex: 0 0 auto;
		margin: 0;
	}
	.lemma-hit {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		cursor: pointer;
		display: flex;
		flex: 0 0 auto;
		flex-direction: column;
		font: inherit;
		gap: 2px;
		min-width: 140px;
		padding: 10px 14px;
		text-align: left;
		transition: border-color 0.12s, background 0.12s;
	}
	.lemma-hit:hover {
		background: var(--surface);
		border-color: var(--ink-mute);
	}
	.lemma-hit.active {
		background: var(--accent-soft);
		border-color: var(--brand);
		box-shadow: inset 0 0 0 1px var(--brand);
	}
	.lemma-hit-word {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 500;
		letter-spacing: -0.005em;
	}
	.lemma-hit-gloss {
		color: var(--ink-soft);
		font-size: 12px;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lemma-hit-empty {
		color: var(--ink-mute);
		flex: 1;
		font-size: 13px;
		font-style: italic;
		padding: 14px 10px;
	}
	.loading-spinner {
		animation: spin 720ms linear infinite;
		border: 2px solid var(--info-soft);
		border-radius: 999px;
		border-top-color: var(--info);
		display: inline-block;
		height: 18px;
		vertical-align: middle;
		width: 18px;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Mode switch row */
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

	/* Form */
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
	.lemma-notes-image-grid .notes-input {
		flex: 1;
		min-height: 0;
		resize: none;
		font-family: inherit;
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
	.lemma-forms-grid .input[readonly] {
		background: color-mix(in oklch, var(--line) 45%, transparent);
		color: var(--ink);
		cursor: default;
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
	.field-label {
		color: var(--ink);
		display: block;
		font-size: 12px;
		font-weight: 500;
		margin-bottom: 4px;
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

	/* Footer */
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

	/* Merge confirm dialog — kept as a compact paper card */
	.picker-modal {
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		width: min(480px, calc(100vw - 2rem));
	}
	.merge-modal {
		width: min(360px, calc(100vw - 2rem));
	}
	.inline-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.status-text {
		color: var(--ink-soft);
		margin: 0;
	}
	.error-text {
		color: var(--danger);
	}
	label {
		display: grid;
		gap: 0.25rem;
	}
	input,
	button {
		font: inherit;
	}
	.secondary-button {
		background: var(--paper);
		border: 1px solid var(--border-strong);
		padding: 0.4rem 0.75rem;
	}

	@media (max-width: 720px) {
		.modal-backdrop {
			padding: 24px 12px 12px;
		}
		.lemma-modal {
			padding: 20px 18px 18px;
		}
		.lemma-form-grid,
		.lemma-forms-grid,
		.lemma-notes-image-grid {
			grid-template-columns: 1fr;
		}
		.lemma-modal-title {
			font-size: 20px;
		}
		.splitter-char {
			font-size: 24px;
			min-width: 28px;
			padding: 4px 8px;
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
