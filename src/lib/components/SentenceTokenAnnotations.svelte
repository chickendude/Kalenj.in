<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { groupSentenceTokens } from '$lib/word-groups';
	import { splitPluralFormVariants } from '$lib/plural-form-variants';
	import { stripWordLinks } from '$lib/word-links';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import LemmaCreationForm from './LemmaCreationForm.svelte';
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';
	import TokenSearchPanel from '$lib/components/TokenSearchPanel.svelte';
	import TokenSplitter from '$lib/components/TokenSplitter.svelte';
	import { getSentenceTimeAnnotation } from '$lib/time-annotations';
	import {
		normalizeSearchQuery,
		serializeSpellings,
		stripSurroundingPunctuation
	} from '$lib/token-annotations';
	import type { PartOfSpeech } from '@prisma/client';
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
		normalizedForm: string;
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
		normalizedForm: string;
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

	type TokenDraft = {
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
		ignoredNormalizedForms = [],
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
		ignoredNormalizedForms?: string[];
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
	let saveState = $state<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
	let createState = $state<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
	let drafts = $state<Record<string, TokenDraft>>({});
	let updateForms = $state<Record<string, HTMLFormElement | null>>({});
	let meaningInputs = $state<Record<string, HTMLInputElement | null>>({});
	// Initialize from the incoming prop so SSR and the first client paint render the
	// full token cards. If we start as [], the empty-state `<p>` paints first and
	// then the cards replace it once the $effect below runs, causing a visible height jump.
	let localTokens = $state<SentenceToken[]>(
		tokens.map((token) => ({
			...token,
			word: token.word ? { ...token.word } : token.word
		}))
	);
	let lastIncomingSignature = $state('');
	let modalElement = $state<HTMLDivElement | null>(null);
	let shortcutsOpen = $state(false);
	let shortcutsWrap = $state<HTMLDivElement | null>(null);

	const isMac =
		typeof navigator !== 'undefined' &&
		/mac|iphone|ipad|ipod/i.test(navigator.platform ?? navigator.userAgent ?? '');
	const navShortcutModifier = isMac ? '⌃⌥' : 'Alt+';
	const prevShortcutTitle = `Previous word (${navShortcutModifier}←)`;
	const nextShortcutTitle = `Next word (${navShortcutModifier}→)`;
	const shortcutEntries = [
		{ label: 'Previous word', keys: isMac ? ['⌃', '⌥', '←'] : ['Alt', '←'] },
		{ label: 'Next word', keys: isMac ? ['⌃', '⌥', '→'] : ['Alt', '→'] },
		{ label: 'Close picker', keys: ['Esc'] }
	];
	let draggedTokenId = $state<string | null>(null);
	let pendingMerge = $state<MergePrompt | null>(null);
	let editingSurfaceTokenId = $state<string | null>(null);
	let surfaceDraft = $state('');
	let surfaceEditInput = $state<HTMLInputElement | null>(null);
	let groupActionError = $state<string | null>(null);
	let splitMarkers = $state<Record<string, number[]>>({});
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
	const activeNormalizedForm = $derived(
		activeSegment?.normalizedForm ?? activeToken?.normalizedForm ?? ''
	);
	const ignoredFormsSet = $derived(new Set(ignoredNormalizedForms));
	const activeIsIgnored = $derived(
		activeNormalizedForm.length > 0 && ignoredFormsSet.has(activeNormalizedForm)
	);
	const isFirstSegmentActive = $derived(
		Boolean(activeToken?.segments?.[0]?.id && activeToken.segments[0].id === activeSegment?.id)
	);

	$effect(() => {
		const incomingSignature = JSON.stringify(
			tokens.map((token) => ({
					id: token.id,
					surfaceForm: token.surfaceForm,
					wordId: token.wordId,
				inContextTranslation: token.inContextTranslation ?? null,
				wordKalenjin: token.word?.kalenjin ?? null,
				wordTranslations: token.word?.translations ? stripWordLinks(token.word.translations) : null,
				wordNotes: token.word?.notes ?? null,
				wordSpellings: token.word?.spellings?.map((spelling) => spelling.spelling) ?? [],
				segments:
					token.segments?.map((segment) => ({
						id: segment.id,
						surfaceForm: segment.surfaceForm,
						wordId: segment.wordId,
						wordKalenjin: segment.word?.kalenjin ?? null,
						wordTranslations: segment.word?.translations ? stripWordLinks(segment.word.translations) : null,
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
			const tokenPluralForms = splitPluralFormVariants(token.word?.pluralForm);
			drafts[token.id] = {
				inContextTranslation: token.inContextTranslation ?? '',
				selectedWordId: token.word?.id ?? '',
				createLemma: token.word?.kalenjin ?? normalizeSearchQuery(token.surfaceForm),
				createTranslations: stripWordLinks(token.word?.translations ?? ''),
				createNotes: token.word?.notes ?? '',
				createAlternativeSpellings: serializeSpellings(token.word?.spellings),
				createPluralForm: tokenPluralForms.pluralForm,
				createAlternativePluralForms: tokenPluralForms.alternativePluralForms,
				createIsPluralOnly: Boolean(token.word?.isPluralOnly),
				createPartOfSpeech: token.word?.partOfSpeech ?? ''
			};

			for (const segment of token.segments ?? []) {
				const segmentPluralForms = splitPluralFormVariants(segment.word?.pluralForm);
				drafts[segment.id] = {
					inContextTranslation: '',
					selectedWordId: segment.word?.id ?? '',
					createLemma: segment.word?.kalenjin ?? normalizeSearchQuery(segment.surfaceForm),
					createTranslations: stripWordLinks(segment.word?.translations ?? ''),
					createNotes: segment.word?.notes ?? '',
					createAlternativeSpellings: serializeSpellings(segment.word?.spellings),
					createPluralForm: segmentPluralForms.pluralForm,
					createAlternativePluralForms: segmentPluralForms.alternativePluralForms,
					createIsPluralOnly: Boolean(segment.word?.isPluralOnly),
					createPartOfSpeech: segment.word?.partOfSpeech ?? ''
				};
			}
		}
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
		if (!shortcutsOpen) {
			return;
		}

		function handlePointerDown(event: MouseEvent) {
			const wrap = shortcutsWrap;
			if (!wrap) return;
			const target = event.target;
			if (target instanceof Node && wrap.contains(target)) return;
			shortcutsOpen = false;
		}

		window.addEventListener('pointerdown', handlePointerDown, true);
		return () => window.removeEventListener('pointerdown', handlePointerDown, true);
	});

	function activatePickerToken(token: SentenceToken, segmentId: string | null = null) {
		openTokenId = token.id;
		const segment = token.segments?.find((entry) => entry.id === segmentId) ?? null;
		activeSegmentId = segment?.id ?? null;
		groupActionError = null;
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

		// Ctrl+Option+arrow on Mac (plain Option+arrow is reserved for native
		// text-input word jump there) / plain Alt+arrow on Win/Linux.
		const navModifiersPressed = isMac
			? event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey
			: event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
		if (
			navModifiersPressed &&
			(event.key === 'ArrowLeft' || event.key === 'ArrowRight')
		) {
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

	function handleSearchQueryChange(tokenId: string, value: string) {
		const normalizedValue = normalizeSearchQuery(value);

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
			message?: string;
			tokens?: SentenceToken[];
		};

		if (!response.ok || !result.tokens) {
			throw new Error(result.message ?? 'Could not update sentence words.');
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

	async function toggleIgnoreActiveWord(): Promise<void> {
		if (!activeToken) return;
		const normalizedForm = activeNormalizedForm;
		const surfaceForm = (activeSegment?.surfaceForm ?? activeGroup?.fullSurface ?? '').trim();
		if (!normalizedForm || !surfaceForm) return;

		const wasIgnored = activeIsIgnored;
		try {
			const response = await fetch('/admin/ignored-word-forms', {
				method: wasIgnored ? 'DELETE' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ normalizedForm, surfaceForm })
			});
			if (!response.ok) {
				const data = (await response.json().catch(() => ({}))) as { message?: string };
				throw new Error(data.message ?? 'Could not update the ignore list.');
			}
			await invalidateAll();
		} catch (ignoreError) {
			groupActionError =
				ignoreError instanceof Error
					? ignoreError.message
					: 'Could not update the ignore list.';
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
			activeSegmentId = null;
		} catch (unsplitError) {
			groupActionError =
				unsplitError instanceof Error ? unsplitError.message : 'Could not unsplit this word.';
			throw unsplitError;
		}
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
		options: {
			closeOnSuccess?: boolean;
			invalidateOnSuccess?: boolean;
			// Skip writing the server response back into local state. Set on the
			// translation autosave form: the draft is the source of truth for
			// what the user typed, and the server only echoes it back — applying
			// it would overwrite newer keystrokes whenever a save was slow.
			skipApply?: boolean;
		} = {}
	) {
		const {
			closeOnSuccess = false,
			invalidateOnSuccess = false,
			skipApply = false
		} = options;

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
					if (!skipApply) {
						const tokenUpdates = (result.data as { tokenUpdates?: TokenUpdatePayload[] } | undefined)?.tokenUpdates;
						if (tokenUpdates?.length) {
							applyTokenUpdates(tokenUpdates);
						}
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
						// The submit button keeps focus by default, so Alt+←/→ keydowns
						// don't bubble to the modal. Restore focus to the dialog so the
						// nav shortcuts work right away.
						queueMicrotask(() => modalElement?.focus());
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
			const tokenPluralForms = splitPluralFormVariants(tokenUpdate.word?.pluralForm);
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
					(tokenUpdate.word?.notes ?? undefined) ??
					drafts[tokenUpdate.tokenId]?.createNotes ??
					'',
				createAlternativeSpellings:
					tokenUpdate.word?.spellings
						? serializeSpellings(tokenUpdate.word.spellings)
						: drafts[tokenUpdate.tokenId]?.createAlternativeSpellings ?? '',
				createPluralForm:
					tokenUpdate.word?.pluralForm !== undefined
						? tokenPluralForms.pluralForm
						: drafts[tokenUpdate.tokenId]?.createPluralForm ?? '',
				createAlternativePluralForms:
					tokenUpdate.word?.pluralForm !== undefined
						? tokenPluralForms.alternativePluralForms
						: drafts[tokenUpdate.tokenId]?.createAlternativePluralForms ?? '',
				createIsPluralOnly:
					tokenUpdate.word?.isPluralOnly ?? drafts[tokenUpdate.tokenId]?.createIsPluralOnly ?? false,
				createPartOfSpeech:
					tokenUpdate.word?.partOfSpeech ?? drafts[tokenUpdate.tokenId]?.createPartOfSpeech ?? ''
			};

			for (const segment of tokenUpdate.segments ?? []) {
				const segmentPluralForms = splitPluralFormVariants(segment.word?.pluralForm);
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
						(segment.word?.notes ?? undefined) ??
						drafts[segment.id]?.createNotes ??
						'',
					createAlternativeSpellings: segment.word?.spellings
						? serializeSpellings(segment.word.spellings)
						: drafts[segment.id]?.createAlternativeSpellings ?? '',
					createPluralForm:
						segment.word?.pluralForm !== undefined
							? segmentPluralForms.pluralForm
							: drafts[segment.id]?.createPluralForm ?? '',
					createAlternativePluralForms:
						segment.word?.pluralForm !== undefined
							? segmentPluralForms.alternativePluralForms
							: drafts[segment.id]?.createAlternativePluralForms ?? '',
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
		<p class="empty-text"><SentenceTimeText text={sentenceText} /></p>
	{:else}
		{#each groups as group (group.key)}
			{@const primaryToken = group.tokens[0]}
			{@const sharedWord = primaryToken.word}
			{@const lexicalSegments = primaryToken.segments ?? []}
			{@const meaningValue = drafts[primaryToken.id]?.inContextTranslation ?? ''}
			{@const timeAnnotation = getSentenceTimeAnnotation(group.fullSurface)}
			{@const tokenIsIgnored =
				!sharedWord &&
				lexicalSegments.length === 0 &&
				ignoredFormsSet.has(primaryToken.normalizedForm)}
			{@const tokenIsUnlinked =
				!sharedWord && lexicalSegments.length === 0 && !tokenIsIgnored}
			<div class="token-group">
				<div class="token-card">
					<div
						class:unlinked-lemma={tokenIsUnlinked}
						class:ignored-lemma={tokenIsIgnored}
						class="lemma-label"
					>
						{#if lexicalSegments.length > 0}
							{#each lexicalSegments as segment, segmentIndex}
								{#if segmentIndex > 0}<span class="segment-divider">+</span>{/if}
								{@const segmentIgnored =
									!segment.word && ignoredFormsSet.has(segment.normalizedForm)}
								<span
									class:unlinked-segment={!segment.word && !segmentIgnored}
									class:ignored-segment={segmentIgnored}
								>
									{segment.word?.kalenjin ?? segment.surfaceForm}
								</span>
							{/each}
						{:else if sharedWord}
							{sharedWord.kalenjin}
						{:else if tokenIsUnlinked}
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
							{#if timeAnnotation}
								<span class="token-time-tooltip" role="tooltip">
									<strong>Western time: {timeAnnotation.westernTime}</strong>
									<span>{timeAnnotation.note}</span>
								</span>
							{/if}
						</button>
					{/if}

					<form
						method="POST"
						action={updateAction}
						class="translation-form"
						bind:this={updateForms[primaryToken.id]}
						use:enhance={enhanceUpdateForm(primaryToken.id, { skipApply: true })}
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
		{@const hasCommittedSegments = splitTabSegments.length > 1}
		{@const activeSurfaceTrim = (activeSurface ?? '').trim()}
		<div
			class="modal-backdrop"
			role="button"
			tabindex="0"
			aria-label="Close lemma picker"
			onclick={() => closePicker()}
			onkeydown={handleBackdropKeydown}
		>
			<div
				bind:this={modalElement}
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
						<div class="lemma-modal-head-actions-row">
							<button
								type="button"
								class="icon-btn"
								aria-label="Previous word"
								data-tooltip={prevShortcutTitle}
								disabled={!hasPrevWord}
								onclick={() => gotoAdjacentWord(-1)}
							>
								‹
							</button>
							<button
								type="button"
								class="icon-btn"
								aria-label="Next word"
								data-tooltip={nextShortcutTitle}
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
						<div class="lemma-modal-head-actions-row lemma-modal-head-actions-row--secondary">
							<div class="shortcuts-wrap" bind:this={shortcutsWrap}>
								<button
									type="button"
									class="icon-btn"
									class:icon-btn--active={shortcutsOpen}
									aria-label="Keyboard shortcuts"
									aria-haspopup="dialog"
									aria-expanded={shortcutsOpen}
									data-tooltip="Keyboard shortcuts"
									onclick={() => (shortcutsOpen = !shortcutsOpen)}
								>
									?
								</button>
								{#if shortcutsOpen}
									<div class="shortcuts-popup" role="dialog" aria-label="Keyboard shortcuts">
										<h4 class="shortcuts-title">Keyboard shortcuts</h4>
										<dl class="shortcuts-list">
											{#each shortcutEntries as entry (entry.label)}
												<div class="shortcuts-row">
													<dt class="shortcuts-row-label">{entry.label}</dt>
													<dd class="shortcuts-row-keys">
														{#each entry.keys as key, idx}
															{#if idx > 0}<span class="shortcuts-plus" aria-hidden="true">+</span>{/if}
															<kbd class="shortcuts-kbd">{key}</kbd>
														{/each}
													</dd>
												</div>
											{/each}
										</dl>
									</div>
								{/if}
							</div>
							<button
								type="button"
								class="icon-btn"
								class:icon-btn--active={activeIsIgnored}
								aria-label={activeIsIgnored
									? 'Stop ignoring this word'
									: 'Ignore this word'}
								aria-pressed={activeIsIgnored}
								data-tooltip="Ignore word"
								onclick={() => void toggleIgnoreActiveWord()}
							>
								⊘
							</button>
						</div>
					</div>
				</div>

				<TokenSplitter
					surface={activeToken.surfaceForm}
					splits={pendingSplits}
					segments={splitTabSegments}
					activeSegmentId={activeSegment?.id ?? null}
					onSplitClick={(boundary) =>
						void applySplitClick(activeToken.id, boundary, activeToken.surfaceForm)}
					onUnsplit={() => void unsplitActiveGroup()}
					onSelectSegment={(segmentId) => activatePickerToken(activeToken, segmentId)}
				/>

				{#if groupActionError}
					<p class="status-text error-text">{groupActionError}</p>
				{/if}

				<TokenSearchPanel
					initialQuery={normalizeSearchQuery(
						activeSegment?.word?.kalenjin ??
							activeSegment?.surfaceForm ??
							activeToken.word?.kalenjin ??
							activeToken.surfaceForm
					)}
					focusKey={`${activeToken.id}|${activeSegment?.id ?? ''}`}
					placeholder={hasCommittedSegments
						? `Search lemmas for "${activeSurfaceTrim}"…`
						: 'Search existing lemmas…'}
					activeWordId={activeWordId}
					activeTokenId={activeToken.id}
					activeSegmentId={activeSegment?.id ?? null}
					inContextTranslation={drafts[activeToken.id]?.inContextTranslation ?? ''}
					{entityId}
					{entityIdField}
					{updateAction}
					{searchEndpoint}
					onQueryChange={(value) => handleSearchQueryChange(activeDraftKey, value)}
					onPickEnhance={enhanceUpdateForm(activeToken.id)}
				/>

				<LemmaCreationForm
					{createAction}
					{updateAction}
					{entityId}
					{entityIdField}
					activeTokenId={activeToken.id}
					activeSegmentId={activeSegment?.id ?? null}
					activeWord={activeWord}
					{activeWordId}
					inContextTranslation={drafts[activeToken.id]?.inContextTranslation ?? ''}
					activeSurface={activeSurface ?? ''}
					draft={drafts[activeDraftKey]}
					createState={createState[activeToken.id] ?? 'idle'}
					onDraftChange={(field, value) => updateDraft(activeDraftKey, field, value)}
					onCreateEnhance={enhanceCreateForm(activeToken.id)}
					onClearEnhance={enhanceUpdateForm(activeToken.id, {
						closeOnSuccess: !activeSegment,
						invalidateOnSuccess: true
					})}
					onCancel={() => closePicker()}
				/>
			</div>
		</div>
	{/if}

	<ConfirmDialog
		open={pendingMerge !== null}
		title="Combine words?"
		message={pendingMerge
			? `Combine "${pendingMerge.sourceSurface}" and "${pendingMerge.targetSurface}" into one word group?`
			: ''}
		confirmLabel="Combine words"
		cancelLabel="Cancel"
		onconfirm={() => void confirmMerge()}
		oncancel={() => (pendingMerge = null)}
	/>
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

	.ignored-lemma {
		background: var(--surface);
	}

	.ignored-segment {
		color: var(--ink-mute);
	}

	.token-button {
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--warning);
		border-radius: 0;
		cursor: pointer;
		font: inherit;
		font-weight: 600;
		position: relative;
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

	.token-time-tooltip {
		background: var(--tooltip-bg);
		border-radius: 0.45rem;
		bottom: calc(100% + 0.35rem);
		color: var(--tooltip-ink);
		display: none;
		font-size: 0.78rem;
		gap: 0.15rem;
		left: 50%;
		max-width: min(18rem, 70vw);
		min-width: 12rem;
		padding: 0.4rem 0.5rem;
		pointer-events: none;
		position: absolute;
		transform: translateX(-50%);
		white-space: normal;
		z-index: 15;
	}

	.token-button:hover .token-time-tooltip,
	.token-button:focus-visible .token-time-tooltip {
		display: grid;
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
		position: relative;
		width: 32px;
	}
	.icon-btn[data-tooltip]::after {
		background: var(--ink);
		border-radius: 3px;
		bottom: calc(100% + 0.35rem);
		color: var(--bg-raised);
		content: attr(data-tooltip);
		font-size: 0.78rem;
		left: 50%;
		line-height: 1.2;
		opacity: 0;
		padding: 0.3rem 0.4rem;
		pointer-events: none;
		position: absolute;
		transform: translateX(-50%);
		transition: opacity 0.04s ease;
		white-space: nowrap;
		z-index: 20;
	}
	.icon-btn[data-tooltip]:hover::after,
	.icon-btn[data-tooltip]:focus-visible::after {
		opacity: 1;
	}
	.icon-btn:hover:not(:disabled) {
		background: var(--surface);
		color: var(--ink);
	}
	.icon-btn:disabled {
		cursor: not-allowed;
		opacity: 0.35;
	}
	.icon-btn--active {
		background: color-mix(in oklch, var(--accent) 15%, transparent);
		color: var(--accent);
	}
	.icon-btn--active:hover:not(:disabled) {
		background: color-mix(in oklch, var(--accent) 25%, transparent);
		color: var(--accent);
	}
	.lemma-modal-head-actions {
		align-items: flex-end;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		gap: 4px;
		margin: -4px -6px 0 0;
	}
	.lemma-modal-head-actions-row {
		align-items: center;
		display: flex;
		gap: 2px;
	}
	.lemma-modal-head-actions-row--secondary {
		justify-content: flex-end;
	}
	.shortcuts-wrap {
		position: relative;
	}
	.shortcuts-popup {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 6px;
		box-shadow: 0 12px 24px -10px rgba(0, 0, 0, 0.25);
		min-width: 240px;
		padding: 12px 14px;
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		z-index: 30;
	}
	.shortcuts-title {
		color: var(--ink-mute);
		font-family: var(--font-display);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		margin: 0 0 10px;
		text-transform: uppercase;
	}
	.shortcuts-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
	}
	.shortcuts-row {
		align-items: center;
		display: flex;
		gap: 12px;
		justify-content: space-between;
	}
	.shortcuts-row-label {
		color: var(--ink);
		font-size: 13px;
	}
	.shortcuts-row-keys {
		align-items: center;
		display: flex;
		gap: 4px;
		margin: 0;
	}
	.shortcuts-kbd {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 3px;
		color: var(--ink);
		font-family: var(--font-mono, var(--font-body));
		font-size: 11px;
		font-weight: 600;
		line-height: 1;
		min-width: 1.4em;
		padding: 3px 5px;
		text-align: center;
	}
	.shortcuts-plus {
		color: var(--ink-mute);
		font-size: 11px;
	}

	.status-text {
		color: var(--ink-soft);
		margin: 0;
	}
	.error-text {
		color: var(--danger);
	}
	input,
	button {
		font: inherit;
	}

	@media (max-width: 720px) {
		.modal-backdrop {
			padding: 24px 12px 12px;
		}
		.lemma-modal {
			padding: 20px 18px 18px;
		}
		.lemma-modal-title {
			font-size: 20px;
		}
	}
</style>
