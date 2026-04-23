<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import CefrBrowseSidebar from '$lib/components/CefrBrowseSidebar.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import GrammarNotes from '$lib/components/GrammarNotes.svelte';
	import ImageUploadField from '$lib/components/ImageUploadField.svelte';
	import LemmaSearchPicker from '$lib/components/LemmaSearchPicker.svelte';
	import SentenceTokenAnnotations from '$lib/components/SentenceTokenAnnotations.svelte';
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';
	import WordCoveragePanel from '$lib/components/WordCoveragePanel.svelte';
	import type { PartOfSpeech } from '@prisma/client';
	import {
		VOCABULARY_LESSON_TYPES,
		formatLessonType,
		formatVocabularyLessonType,
		splitLessonItemsIntoSections
	} from '$lib/course';
	import { suggestCefrTargets } from '$lib/cefr-suggestions';
	import { isUnsetSentenceEnglish } from '$lib/sentence-placeholders';
	import { splitSentenceText } from '$lib/story-split';
	import { stripWordLinks } from '$lib/word-links';

	let { data, form } = $props();

	type CefrUrlChanges = {
		query?: string;
		sort?: 'alpha-asc' | 'alpha-desc';
		page?: number;
		coverage?: 'all' | 'covered' | 'uncovered';
		pos?: string[];
	};

	function buildLessonCefrUrl(changes: CefrUrlChanges = {}): string {
		const params = new URLSearchParams();
		const query = changes.query ?? data.cefrBrowse.query;
		const sort = changes.sort ?? data.cefrBrowse.sort;
		const page = changes.page ?? data.cefrBrowse.page;
		const coverage = changes.coverage ?? data.cefrBrowse.coverageFilter;
		const pos = changes.pos ?? data.cefrBrowse.posFilters;

		if (query) params.set('q', query);
		if (sort !== 'alpha-asc') params.set('sort', sort);
		if (page > 1) params.set('page', String(page));
		if (coverage !== 'all') params.set('covered', coverage === 'covered' ? 'yes' : 'no');
		if (pos.length > 0) params.set('pos', pos.join(','));

		const qs = params.toString();
		return qs ? `/lessons/${data.lesson.id}?${qs}` : `/lessons/${data.lesson.id}`;
	}

	type LessonType = 'VOCABULARY' | 'STORY';
	type VocabularyType = '' | 'GRAMMAR' | 'VOCAB' | 'EXPRESSION';
	type StorySentence = NonNullable<typeof data.lesson.story>['sentences'][number];
	type InlineStoryField = 'speaker' | 'english' | 'grammarNotes';

	let showAddWordForm = $state(false);
	let vocabPanelsOpen = $state(false);

	type AddWordPickerState = {
		selectedWord: {
			id: string;
			kalenjin: string;
			translations: string;
			partOfSpeech?: PartOfSpeech | string | null;
		} | null;
		mode: 'search' | 'create';
		draftKalenjin: string;
		draftTranslations: string;
		draftAlternativeSpellings: string;
		draftNotes: string;
		draftPartOfSpeech: PartOfSpeech | '';
		draftPluralForm: string;
		draftIsPluralOnly: boolean;
		draftPresentAnee: string;
		draftPresentInyee: string;
		draftPresentInee: string;
		draftPresentEchek: string;
		draftPresentOkwek: string;
		draftPresentIchek: string;
		sentenceKalenjin: string;
		sentenceEnglish: string;
		error: string | null;
	};

	function emptyAddWordState(): AddWordPickerState {
		return {
			selectedWord: null,
			mode: 'search',
			draftKalenjin: '',
			draftTranslations: '',
			draftAlternativeSpellings: '',
			draftNotes: '',
			draftPartOfSpeech: '',
			draftPluralForm: '',
			draftIsPluralOnly: false,
			draftPresentAnee: '',
			draftPresentInyee: '',
			draftPresentInee: '',
			draftPresentEchek: '',
			draftPresentOkwek: '',
			draftPresentIchek: '',
			sentenceKalenjin: '',
			sentenceEnglish: '',
			error: null
		};
	}

	let addWordState = $state<AddWordPickerState>(emptyAddWordState());
	let inlineStoryEdit = $state<{ sentenceId: string; field: InlineStoryField } | null>(null);
	let inlineStoryValue = $state('');
	let inlineStoryError = $state<string | null>(null);
	let storySentences = $state<StorySentence[]>([]);
	let inlineStoryInput = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let storyFocusRequests = $state<
		Record<string, { position: 'first' | 'last'; nonce: number }>
	>({});
	let storyFocusNonce = 0;

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

	let exampleFocusRequests = $state<
		Record<string, { position: 'first' | 'last'; nonce: number }>
	>({});
	let exampleFocusNonce = 0;

	function focusExampleSentence(targetSentenceId: string, position: 'first' | 'last') {
		exampleFocusNonce += 1;
		exampleFocusRequests = {
			...exampleFocusRequests,
			[targetSentenceId]: {
				position,
				nonce: exampleFocusNonce
			}
		};
	}

	function findAdjacentLessonWordWithSentence(
		currentLessonWordId: string,
		direction: 'prev' | 'next'
	) {
		const index = orderedLessonWords.findIndex((word) => word.id === currentLessonWordId);
		if (index < 0) {
			return null;
		}
		const step = direction === 'next' ? 1 : -1;
		for (let i = index + step; i >= 0 && i < orderedLessonWords.length; i += step) {
			const candidate = orderedLessonWords[i];
			if (candidate.sentence) {
				return candidate;
			}
		}
		return null;
	}

	type InlineLessonWordField = 'sentenceKalenjin' | 'sentenceEnglish' | 'notesMarkdown';
	type LessonWordLocalState = {
		sentenceKalenjin: string;
		sentenceEnglish: string;
		notesMarkdown: string;
	};
	let inlineLessonWordEdit = $state<{ lessonWordId: string; field: InlineLessonWordField } | null>(null);
	let inlineLessonWordValue = $state('');
	let inlineLessonWordError = $state<string | null>(null);
	let inlineLessonWordInput = $state<HTMLTextAreaElement | null>(null);
	let lessonWordLocalState = $state(new Map<string, LessonWordLocalState>());

	type InlineWordField = 'kalenjin' | 'translations';
	type WordLocalState = { kalenjin: string; translations: string };
	let inlineWordEdit = $state<{ lessonWordId: string; field: InlineWordField } | null>(null);
	let inlineWordValue = $state('');
	let inlineWordError = $state<string | null>(null);
	let inlineWordInput = $state<HTMLInputElement | null>(null);
	let wordLocalState = $state(new Map<string, WordLocalState>());
	let lessonWordOrder = $state<string[]>([]);
	let lessonWordOrderSignature = $state('');
	let draggedLessonWordId = $state<string | null>(null);
	let dropTargetLessonWordId = $state<string | null>(null);
	let reorderWordsForm = $state<HTMLFormElement | null>(null);
	let reorderWordsError = $state<string | null>(null);

	type PendingDelete =
		| { kind: 'word'; form: HTMLFormElement; wordLabel: string }
		| { kind: 'lesson'; form: HTMLFormElement };
	let pendingDelete = $state<PendingDelete | null>(null);

	let cefrLocalTargets = $state(new Map<string, string[]>());
	let cefrDismissed = $state(new Map<string, Set<string>>());
	let cefrSearchQuery = $state(new Map<string, string>());
	let cefrSearchOpen = $state(new Map<string, boolean>());
	let cefrErrors = $state(new Map<string, string>());

	let lessonTitle = $state('');
	let lessonType = $state<LessonType>('VOCABULARY');
	let lessonVocabularyType = $state<VocabularyType>('VOCAB');
	let lessonGrammarMarkdown = $state('');

	let titleEditing = $state(false);
	let titleDraft = $state('');
	let titleInput = $state<HTMLInputElement | null>(null);
	let titleError = $state<string | null>(null);
	let titleSaving = $state(false);
	let vocabularyTypeError = $state<string | null>(null);
	let vocabTypeOpen = $state(false);
	let vocabTypeWrap = $state<HTMLSpanElement | null>(null);
	let lessonNavOpen = $state(false);
	let lessonNavWrap = $state<HTMLSpanElement | null>(null);

	beforeNavigate(() => {
		lessonNavOpen = false;
		vocabTypeOpen = false;
	});

	type EnhancedSubmitResult = ActionResult<Record<string, unknown> | undefined, Record<string, unknown> | undefined>;
	type EnhancedUpdate = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;

	type CefrTarget = (typeof data.cefrTargets)[number];
	const replaceSentenceLabel = 'Replace sentence text';
	const missingSentenceTranslationLabel = 'Add translation';

	const flattenedLessonWords = $derived(
		data.lesson.sections
			.flatMap((section) =>
				section.words.map((word) => ({
					...word,
					sectionOrder: section.sectionOrder
				}))
			)
			.sort((a, b) => {
				if (a.sectionOrder !== b.sectionOrder) {
					return a.sectionOrder - b.sectionOrder;
				}

				return a.itemOrder - b.itemOrder;
			})
	);
	const orderedLessonWords = $derived(orderLessonWords(flattenedLessonWords, lessonWordOrder));
	const displaySections = $derived(splitLessonItemsIntoSections(orderedLessonWords));

	$effect(() => {
		lessonTitle = data.lesson.title;
		lessonType = data.lesson.type;
		lessonVocabularyType = data.lesson.vocabularyType ?? 'VOCAB';
		lessonGrammarMarkdown = data.lesson.grammarMarkdown ?? '';
		storySentences = data.lesson.story?.sentences.map((sentence) => ({ ...sentence })) ?? [];
	});

	$effect(() => {
		const nextSignature = flattenedLessonWords.map((word) => word.id).join('|');
		if (nextSignature !== lessonWordOrderSignature) {
			lessonWordOrder = flattenedLessonWords.map((word) => word.id);
			lessonWordOrderSignature = nextSignature;
		}
	});

	$effect(() => {
		if (!inlineStoryEdit) {
			return;
		}

		const timeout = window.setTimeout(() => {
			inlineStoryInput?.focus();
			inlineStoryInput?.select();
		}, 0);

		return () => window.clearTimeout(timeout);
	});

	$effect(() => {
		if (!inlineLessonWordEdit) return;
		const timeout = window.setTimeout(() => {
			inlineLessonWordInput?.focus();
			inlineLessonWordInput?.select();
		}, 0);
		return () => window.clearTimeout(timeout);
	});

	$effect(() => {
		if (!inlineWordEdit) return;
		const timeout = window.setTimeout(() => {
			inlineWordInput?.focus();
			inlineWordInput?.select();
		}, 0);
		return () => window.clearTimeout(timeout);
	});

	$effect(() => {
		if (!titleEditing) return;
		const timeout = window.setTimeout(() => {
			titleInput?.focus();
			titleInput?.select();
		}, 0);
		return () => window.clearTimeout(timeout);
	});

	async function postLessonInline(field: 'title' | 'vocabularyType' | 'grammarMarkdown', value: string) {
		const response = await fetch(`/lessons/${data.lesson.id}/lesson-inline`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ field, value })
		});
		const payload = (await response.json()) as { error?: string };
		if (!response.ok) {
			throw new Error(payload.error ?? 'Could not save.');
		}
	}

	function startTitleEdit() {
		titleDraft = lessonTitle;
		titleError = null;
		titleEditing = true;
	}

	function cancelTitleEdit() {
		titleEditing = false;
		titleError = null;
	}

	async function saveTitleEdit() {
		if (titleSaving) return;
		const next = titleDraft.trim();
		if (!next) {
			titleError = 'Title is required.';
			return;
		}
		if (next === lessonTitle) {
			titleEditing = false;
			return;
		}
		titleSaving = true;
		try {
			await postLessonInline('title', next);
			lessonTitle = next;
			titleEditing = false;
			await invalidateAll();
		} catch (err) {
			titleError = err instanceof Error ? err.message : 'Could not save title.';
		} finally {
			titleSaving = false;
		}
	}

	function handleTitleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void saveTitleEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelTitleEdit();
		}
	}

	async function setVocabularyType(next: VocabularyType) {
		vocabTypeOpen = false;
		if (lessonType !== 'VOCABULARY') return;
		if (!next || next === lessonVocabularyType) return;
		vocabularyTypeError = null;
		const previous = lessonVocabularyType;
		lessonVocabularyType = next;
		try {
			await postLessonInline('vocabularyType', next);
			await invalidateAll();
		} catch (err) {
			lessonVocabularyType = previous;
			vocabularyTypeError = err instanceof Error ? err.message : 'Could not change vocabulary type.';
		}
	}

	function handleVocabTypeWindowClick(event: MouseEvent) {
		if (!vocabTypeOpen) return;
		const target = event.target;
		if (vocabTypeWrap && target instanceof Node && vocabTypeWrap.contains(target)) return;
		vocabTypeOpen = false;
	}

	function handleVocabTypeWindowKey(event: KeyboardEvent) {
		if (event.key === 'Escape' && vocabTypeOpen) {
			vocabTypeOpen = false;
		}
	}

	function handleLessonNavWindowClick(event: MouseEvent) {
		if (!lessonNavOpen) return;
		const target = event.target;
		if (lessonNavWrap && target instanceof Node && lessonNavWrap.contains(target)) return;
		lessonNavOpen = false;
	}

	function handleLessonNavWindowKey(event: KeyboardEvent) {
		if (event.key === 'Escape' && lessonNavOpen) {
			lessonNavOpen = false;
		}
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		window.addEventListener('mousedown', handleVocabTypeWindowClick);
		window.addEventListener('keydown', handleVocabTypeWindowKey);
		window.addEventListener('mousedown', handleLessonNavWindowClick);
		window.addEventListener('keydown', handleLessonNavWindowKey);
		return () => {
			window.removeEventListener('mousedown', handleVocabTypeWindowClick);
			window.removeEventListener('keydown', handleVocabTypeWindowKey);
			window.removeEventListener('mousedown', handleLessonNavWindowClick);
			window.removeEventListener('keydown', handleLessonNavWindowKey);
		};
	});

	async function saveGrammarMarkdown(value: string) {
		await postLessonInline('grammarMarkdown', value);
		lessonGrammarMarkdown = value;
		await invalidateAll();
	}

	function isTargetSelected(
		targetId: string,
		selectedTargets: Array<{ id: string }>
	): boolean {
		return selectedTargets.some((target) => target.id === targetId);
	}

	function beginInlineStoryEdit(sentence: (typeof storySentences)[number], field: InlineStoryField) {
		inlineStoryEdit = { sentenceId: sentence.id, field };
		inlineStoryValue =
			field === 'speaker'
				? sentence.speaker ?? ''
				: field === 'grammarNotes'
					? sentence.grammarNotes ?? ''
					: sentence.english;
		inlineStoryError = null;
	}

	function cancelInlineStoryEdit() {
		inlineStoryEdit = null;
		inlineStoryValue = '';
		inlineStoryError = null;
	}

	async function saveInlineStoryEdit() {
		if (!inlineStoryEdit) {
			return;
		}

		try {
			const response = await fetch(`/lessons/${data.lesson.id}/story-sentence-inline`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					sentenceId: inlineStoryEdit.sentenceId,
					field: inlineStoryEdit.field,
					value: inlineStoryValue
				})
			});

			const result = (await response.json()) as {
				error?: string;
				sentence?: {
					id: string;
					speaker: string | null;
					english: string;
					grammarNotes: string | null;
				};
			};

			if (!response.ok || !result.sentence) {
				throw new Error(result.error ?? 'Could not save story field.');
			}

			storySentences = storySentences.map((sentence) =>
				sentence.id === result.sentence?.id
					? {
							...sentence,
							speaker: result.sentence.speaker,
							english: result.sentence.english,
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

	let storyRowBusy = $state<string | null>(null);

	async function splitStorySentence(sentenceId: string) {
		if (storyRowBusy) return;
		storyRowBusy = sentenceId;
		inlineStoryError = null;
		try {
			const response = await fetch(`/lessons/${data.lesson.id}/story-sentence-split`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ sentenceId })
			});
			const result = (await response.json()) as { error?: string };
			if (!response.ok) {
				throw new Error(result.error ?? 'Could not split sentence.');
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
			const response = await fetch(`/lessons/${data.lesson.id}/story-sentence-merge`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ sentenceId })
			});
			const result = (await response.json()) as { error?: string };
			if (!response.ok) {
				throw new Error(result.error ?? 'Could not merge sentence.');
			}
			await invalidateAll();
		} catch (err) {
			inlineStoryError = err instanceof Error ? err.message : 'Could not merge sentence.';
		} finally {
			storyRowBusy = null;
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

	function getLessonWordLocal(
		lw: {
			id: string;
			sentence: { kalenjin: string; english: string } | null;
			notesMarkdown: string | null;
		}
	): LessonWordLocalState {
		return (
			lessonWordLocalState.get(lw.id) ?? {
				sentenceKalenjin: lw.sentence?.kalenjin ?? '',
				sentenceEnglish: isUnsetSentenceEnglish(lw.sentence?.english) ? '' : lw.sentence?.english ?? '',
				notesMarkdown: lw.notesMarkdown ?? ''
			}
		);
	}

	function getWordLocal(
		lw: { id: string; kalenjin: string; translations: string }
	): WordLocalState {
		return (
			wordLocalState.get(lw.id) ?? {
				kalenjin: lw.kalenjin,
				translations: lw.translations
			}
		);
	}

	function orderLessonWords<T extends { id: string }>(words: T[], orderedIds: string[]): T[] {
		if (orderedIds.length === 0) {
			return words;
		}

		const wordsById = new Map(words.map((word) => [word.id, word]));
		const ordered = orderedIds
			.map((id) => wordsById.get(id))
			.filter((word): word is T => word !== undefined);
		const orderedSet = new Set(ordered.map((word) => word.id));
		return [...ordered, ...words.filter((word) => !orderedSet.has(word.id))];
	}

	function beginInlineWordEdit(
		lw: { id: string; kalenjin: string; translations: string },
		field: InlineWordField
	) {
		inlineWordEdit = { lessonWordId: lw.id, field };
		inlineWordValue = getWordLocal(lw)[field];
		inlineWordError = null;
	}

	function cancelInlineWordEdit() {
		inlineWordEdit = null;
		inlineWordValue = '';
		inlineWordError = null;
	}

	async function saveInlineWordEdit() {
		if (!inlineWordEdit) return;
		const { lessonWordId, field } = inlineWordEdit;
		try {
			const response = await fetch(`/lessons/${data.lesson.id}/lesson-word-inline`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lessonWordId, field, value: inlineWordValue })
			});
			const result = (await response.json()) as { error?: string };
			if (!response.ok) throw new Error(result.error ?? 'Could not save.');
			const lw = flattenedLessonWords.find((w) => w.id === lessonWordId);
			if (lw) {
				wordLocalState = new Map(wordLocalState).set(lessonWordId, {
					...getWordLocal(lw),
					[field]: inlineWordValue
				});
			}
			cancelInlineWordEdit();
		} catch (err) {
			inlineWordError = err instanceof Error ? err.message : 'Could not save.';
		}
	}

	function handleInlineWordKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void saveInlineWordEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelInlineWordEdit();
		}
	}

	function beginInlineLessonWordEdit(
		lw: {
			id: string;
			sentence: { kalenjin: string; english: string } | null;
			notesMarkdown: string | null;
		},
		field: InlineLessonWordField
	) {
		inlineLessonWordEdit = { lessonWordId: lw.id, field };
		inlineLessonWordValue = getLessonWordLocal(lw)[field];
		inlineLessonWordError = null;
	}

	function cancelInlineLessonWordEdit() {
		inlineLessonWordEdit = null;
		inlineLessonWordValue = '';
		inlineLessonWordError = null;
	}

	async function saveInlineLessonWordEdit() {
		if (!inlineLessonWordEdit) return;
		const { lessonWordId, field } = inlineLessonWordEdit;
		try {
			const response = await fetch(`/lessons/${data.lesson.id}/lesson-word-inline`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lessonWordId, field, value: inlineLessonWordValue })
			});
			const result = (await response.json()) as { error?: string };
			if (!response.ok) throw new Error(result.error ?? 'Could not save.');
			const lw = flattenedLessonWords.find((w) => w.id === lessonWordId);
			if (lw) {
				lessonWordLocalState = new Map(lessonWordLocalState).set(lessonWordId, {
					...getLessonWordLocal(lw),
					[field]: inlineLessonWordValue
				});
			}
			cancelInlineLessonWordEdit();
			// Refresh page data after a Kalenjin sentence edit so SentenceTokenAnnotations
			// receives the freshly re-synced tokens rather than the stale page-load snapshot.
			if (field === 'sentenceKalenjin') {
				await invalidateAll();
			}
		} catch (err) {
			inlineLessonWordError = err instanceof Error ? err.message : 'Could not save.';
		}
	}

	function handleInlineLessonWordKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			void saveInlineLessonWordEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelInlineLessonWordEdit();
		}
	}

	function handleInlineLessonWordLineKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void saveInlineLessonWordEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelInlineLessonWordEdit();
		}
	}

	function getCefrCoveredIds(lw: { id: string; coveredCefrTargets: { id: string }[] }): string[] {
		return cefrLocalTargets.get(lw.id) ?? lw.coveredCefrTargets.map((t) => t.id);
	}

	function getCefrCoveredTargets(lw: { id: string; coveredCefrTargets: { id: string }[] }) {
		const ids = getCefrCoveredIds(lw);
		return ids
			.map((id) => data.cefrTargets.find((t) => t.id === id))
			.filter((target): target is CefrTarget => target !== undefined);
	}

	function isCefrTargetUsedByAnotherWord(target: CefrTarget, lessonWordId: string): boolean {
		return Boolean(target.coveredByLessonWordId && target.coveredByLessonWordId !== lessonWordId);
	}

	function getCefrSuggestions(lw: {
		id: string;
		kalenjin: string;
		translations: string;
		coveredCefrTargets: { id: string }[];
	}) {
		const coveredIds = new Set(getCefrCoveredIds(lw));
		const dismissed = cefrDismissed.get(lw.id) ?? new Set<string>();
		return suggestCefrTargets(getWordLocal(lw).translations, data.cefrTargets, coveredIds).filter(
			(t) => !dismissed.has(t.id)
		);
	}

	function getCefrSearchMatches(lw: { id: string; coveredCefrTargets: { id: string }[] }) {
		const query = (cefrSearchQuery.get(lw.id) ?? '').toLowerCase().trim();
		if (!query) return [];
		const coveredIds = new Set(getCefrCoveredIds(lw));
		return data.cefrTargets.filter(
			(t) =>
				!coveredIds.has(t.id) &&
				(t.english.toLowerCase().includes(query) || t.level.toLowerCase().includes(query))
		);
	}

	function getCefrSearchResults(lw: { id: string; coveredCefrTargets: { id: string }[] }) {
		return getCefrSearchMatches(lw).slice(0, 8);
	}

	function getCefrSearchResultCount(lw: { id: string; coveredCefrTargets: { id: string }[] }) {
		return getCefrSearchMatches(lw).length;
	}

	function resetCefrSearch(lessonWordId: string) {
		cefrSearchQuery = new Map(cefrSearchQuery).set(lessonWordId, '');
		cefrSearchOpen = new Map(cefrSearchOpen).set(lessonWordId, false);
	}

	async function readCefrError(response: Response) {
		try {
			const payload = (await response.json()) as { message?: string; error?: string };
			return payload.message ?? payload.error ?? 'Could not update CEFR targets.';
		} catch {
			return 'Could not update CEFR targets.';
		}
	}

	async function addCefrTarget(lessonWordId: string, targetId: string) {
		try {
			const response = await fetch(`/lessons/${data.lesson.id}/cefr-target`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lessonWordId, targetId, action: 'add' })
			});
			if (!response.ok) {
				throw new Error(await readCefrError(response));
			}
			const lw = flattenedLessonWords.find((w) => w.id === lessonWordId);
			if (lw) {
				cefrLocalTargets = new Map(cefrLocalTargets).set(lessonWordId, [
					...new Set([...getCefrCoveredIds(lw), targetId])
				]);
			}
			cefrErrors = new Map(cefrErrors).set(lessonWordId, '');
		} catch (error) {
			cefrErrors = new Map(cefrErrors).set(
				lessonWordId,
				error instanceof Error ? error.message : 'Could not update CEFR targets.'
			);
		}
	}

	async function removeCefrTarget(lessonWordId: string, targetId: string) {
		try {
			const response = await fetch(`/lessons/${data.lesson.id}/cefr-target`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lessonWordId, targetId, action: 'remove' })
			});
			if (!response.ok) {
				throw new Error(await readCefrError(response));
			}
			const lw = flattenedLessonWords.find((w) => w.id === lessonWordId);
			if (lw) {
				cefrLocalTargets = new Map(cefrLocalTargets).set(
					lessonWordId,
					getCefrCoveredIds(lw).filter((id) => id !== targetId)
				);
			}
			cefrErrors = new Map(cefrErrors).set(lessonWordId, '');
		} catch (error) {
			cefrErrors = new Map(cefrErrors).set(
				lessonWordId,
				error instanceof Error ? error.message : 'Could not update CEFR targets.'
			);
		}
	}

	function dismissCefrSuggestion(lessonWordId: string, targetId: string) {
		const current = cefrDismissed.get(lessonWordId) ?? new Set<string>();
		cefrDismissed = new Map(cefrDismissed).set(lessonWordId, new Set([...current, targetId]));
	}

	function toggleAddWordForm() {
		if (showAddWordForm) {
			showAddWordForm = false;
			addWordState = emptyAddWordState();
		} else {
			addWordState = emptyAddWordState();
			showAddWordForm = true;
		}
	}

	function enhanceAddWordForm() {
		return async ({
			result,
			update
		}: {
			result: EnhancedSubmitResult;
			update: EnhancedUpdate;
		}) => {
			if (result.type === 'success') {
				await update({ reset: false, invalidateAll: true });
				showAddWordForm = false;
				addWordState = emptyAddWordState();
				return;
			}
			if (result.type === 'failure') {
				const data = result.data;
				const message =
					data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
						? (data.error as string)
						: 'Could not create lesson word.';
				addWordState = { ...addWordState, error: message };
				return;
			}
			await applyAction(result);
		};
	}

	function enhanceReorderWordsForm() {
		return async ({
			result,
			update
		}: {
			result: EnhancedSubmitResult;
			update: EnhancedUpdate;
		}) => {
			if (result.type === 'success') {
				reorderWordsError = null;
				await update({ reset: false, invalidateAll: true });
				return;
			}

			const data = result.type === 'failure' ? result.data : undefined;
			reorderWordsError =
				data && 'error' in data && typeof data.error === 'string'
					? data.error
					: 'Could not save word order.';
		};
	}

	function requestDeleteWord(event: SubmitEvent, wordLabel: string) {
		if (pendingDelete?.kind === 'word' && pendingDelete.form === event.currentTarget) {
			return;
		}
		event.preventDefault();
		pendingDelete = {
			kind: 'word',
			form: event.currentTarget as HTMLFormElement,
			wordLabel
		};
	}

	function requestDeleteLesson(event: SubmitEvent) {
		if (pendingDelete?.kind === 'lesson' && pendingDelete.form === event.currentTarget) {
			return;
		}
		event.preventDefault();
		pendingDelete = {
			kind: 'lesson',
			form: event.currentTarget as HTMLFormElement
		};
	}

	function cancelPendingDelete() {
		pendingDelete = null;
	}

	function confirmPendingDelete() {
		if (!pendingDelete) return;
		const form = pendingDelete.form;
		pendingDelete = null;
		form.submit();
	}

	function handleLessonWordDragStart(event: DragEvent, lessonWordId: string) {
		draggedLessonWordId = lessonWordId;
		dropTargetLessonWordId = null;
		reorderWordsError = null;
		event.dataTransfer?.setData('text/plain', lessonWordId);
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleLessonWordDragOver(event: DragEvent, lessonWordId: string) {
		if (!draggedLessonWordId || draggedLessonWordId === lessonWordId) {
			return;
		}

		event.preventDefault();
		dropTargetLessonWordId = lessonWordId;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	function handleLessonWordDragLeave(lessonWordId: string) {
		if (dropTargetLessonWordId === lessonWordId) {
			dropTargetLessonWordId = null;
		}
	}

	function handleLessonWordDragEnd() {
		draggedLessonWordId = null;
		dropTargetLessonWordId = null;
	}

	function handleLessonWordDrop(event: DragEvent, targetLessonWordId: string) {
		event.preventDefault();
		const sourceLessonWordId =
			draggedLessonWordId || event.dataTransfer?.getData('text/plain') || null;
		draggedLessonWordId = null;
		dropTargetLessonWordId = null;

		if (!sourceLessonWordId || sourceLessonWordId === targetLessonWordId) {
			return;
		}

		const nextOrder = [...lessonWordOrder];
		const sourceIndex = nextOrder.indexOf(sourceLessonWordId);
		const targetIndex = nextOrder.indexOf(targetLessonWordId);
		if (sourceIndex < 0 || targetIndex < 0) {
			return;
		}

		const [movedId] = nextOrder.splice(sourceIndex, 1);
		nextOrder.splice(targetIndex, 0, movedId);
		lessonWordOrder = nextOrder;
		window.setTimeout(() => reorderWordsForm?.requestSubmit(), 0);
	}
</script>

<section class="lesson-page">
	<div class="lesson-head-row">
		<div class="page-header-main">
			<a href="/lessons" class="back-link">← Back to lessons</a>
			<div class="kicker">
				{#if lessonType === 'VOCABULARY'}
					{@const currentVocabType = lessonVocabularyType || 'VOCAB'}
					<span class="vocab-type-select-wrap" bind:this={vocabTypeWrap}>
						<button
							type="button"
							class="vocab-type-trigger"
							aria-haspopup="listbox"
							aria-expanded={vocabTypeOpen}
							onclick={() => (vocabTypeOpen = !vocabTypeOpen)}
						>
							<span class="vocab-type-label">
								{formatVocabularyLessonType(currentVocabType)}
							</span>
						</button>
						{#if vocabTypeOpen}
							<ul class="vocab-type-menu" role="listbox">
								{#each VOCABULARY_LESSON_TYPES as option}
									<li>
										<button
											type="button"
											role="option"
											aria-selected={option === currentVocabType}
											class="vocab-type-option"
											class:vocab-type-option--selected={option === currentVocabType}
											onclick={() => void setVocabularyType(option)}
										>
											{formatVocabularyLessonType(option)}
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</span>
				{:else}
					{formatLessonType(lessonType)} lesson
				{/if}
				·
				{#if data.prevLesson}
					<a
						href="/lessons/{data.prevLesson.id}"
						class="lesson-nav-icon"
						aria-label={`Previous lesson: ${data.prevLesson.title}`}
						title={`Previous lesson: ${data.prevLesson.title}`}
					>
						←
					</a>
				{/if}
				<span class="lesson-nav-select-wrap" bind:this={lessonNavWrap}>
					<button
						type="button"
						class="lesson-nav-trigger"
						aria-haspopup="listbox"
						aria-expanded={lessonNavOpen}
						onclick={() => (lessonNavOpen = !lessonNavOpen)}
					>
						Lesson {data.lesson.lessonOrder}
					</button>
					{#if lessonNavOpen}
						<ul class="lesson-nav-menu" role="listbox">
							{#each data.levelLessons as entry}
								{@const isCurrent = entry.id === data.lesson.id}
								<li>
									{#if isCurrent}
										<span
											class="lesson-nav-option lesson-nav-option--current"
											class:lesson-nav-option--vocab={entry.type === 'VOCABULARY'}
											class:lesson-nav-option--story={entry.type === 'STORY'}
											aria-current="true"
										>
											<span class="lesson-nav-option-number">{entry.lessonOrder}.</span>
											<span class="lesson-nav-option-title">{entry.title}</span>
										</span>
									{:else}
										<a
											href="/lessons/{entry.id}"
											role="option"
											aria-selected="false"
											class="lesson-nav-option"
											class:lesson-nav-option--vocab={entry.type === 'VOCABULARY'}
											class:lesson-nav-option--story={entry.type === 'STORY'}
										>
											<span class="lesson-nav-option-number">{entry.lessonOrder}.</span>
											<span class="lesson-nav-option-title">{entry.title}</span>
										</a>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</span>
				{#if data.nextLesson}
					<a
						href="/lessons/{data.nextLesson.id}"
						class="lesson-nav-icon"
						aria-label={`Next lesson: ${data.nextLesson.title}`}
						title={`Next lesson: ${data.nextLesson.title}`}
					>
						→
					</a>
				{/if}
			</div>
			{#if titleEditing}
				<input
					bind:this={titleInput}
					class="title-input"
					bind:value={titleDraft}
					onkeydown={handleTitleKeydown}
					onblur={() => void saveTitleEdit()}
					disabled={titleSaving}
					aria-label="Lesson title"
				/>
			{:else}
				<button type="button" class="title-button" onclick={startTitleEdit} title="Click to edit">
					<h1>{lessonTitle}</h1>
				</button>
			{/if}
			{#if titleError}
				<p class="error-text">{titleError}</p>
			{/if}
			{#if vocabularyTypeError}
				<p class="error-text">{vocabularyTypeError}</p>
			{/if}
		</div>
		<div class="lesson-head-actions">
			<form
				method="POST"
				action="?/deleteLesson"
				class="lesson-delete-form"
				onsubmit={requestDeleteLesson}
			>
				<button type="submit" class="btn-sm danger">Delete lesson</button>
			</form>
		</div>
	</div>

	{#if lessonType === 'VOCABULARY'}
		<GrammarNotes source={lessonGrammarMarkdown} onSave={saveGrammarMarkdown} />
	{/if}

	{#if form?.error}
		<p class="error">{form.error}</p>
	{:else if form?.updateLessonSuccess}
		<p class="success">Saved lesson changes.</p>
	{:else if form?.createWordSuccess}
		<p class="success">Created lesson word.</p>
	{:else if form?.updateStorySentenceSuccess}
		<p class="success">Saved story sentence.</p>
	{:else if form?.deleteWordSuccess}
		<p class="success">Deleted lesson word.</p>
	{:else if form?.reorderWordsSuccess}
		<p class="success">Saved word order.</p>
	{:else if form?.updateStorySentenceTokenSuccess || form?.updateExampleSentenceTokenSuccess}
		<p class="success">Saved sentence annotation.</p>
	{:else if form?.createStorySentenceWordSuccess || form?.createExampleSentenceWordSuccess}
		<p class="success">Created lemma and linked it.</p>
	{/if}


	{#if data.storyWordCoverage}
		<WordCoveragePanel title="Word coverage" entries={data.storyWordCoverage} />
	{/if}

	{#if data.lesson.type === 'STORY'}
		<section class="content-card">
			<div class="table-header story-grid">
				<span>Speaker</span>
				<span>Text</span>
				<span></span>
				<span>Translation</span>
			</div>

			{#if !data.lesson.story || storySentences.length === 0}
				<p>No story sentences yet.</p>
			{:else}
				{#each storySentences as sentence, sentenceIndex}
					{@const prev = sentenceIndex > 0 ? storySentences[sentenceIndex - 1] : null}
					{@const next =
						sentenceIndex < storySentences.length - 1
							? storySentences[sentenceIndex + 1]
							: null}
					{@const showSpeaker = !prev || prev.speaker !== sentence.speaker}
					{@const canSplit = splitSentenceText(sentence.kalenjin).length > 1}
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
								audioUrl={sentence.corpusSentence?.audioUrl ?? null}
								size="sm"
								label="Play sentence"
							/>
							<SentenceTokenAnnotations
								entityId={sentence.id}
								entityIdField="storySentenceId"
								entityKind="story"
								sentenceId={sentence.id}
								sentenceText={sentence.kalenjin}
								tokens={sentence.tokens}
								dictionaryWords={data.words}
								updateAction="?/updateStorySentenceToken"
								createAction="?/createStorySentenceWord"
								searchEndpoint={`/lessons/${data.lesson.id}/word-search`}
								tokenGroupEndpoint={`/lessons/${data.lesson.id}/token-groups`}
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
									<SentenceTimeText text={sentence.english} />
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
										<button type="button" class="btn btn-sm" onclick={() => void saveInlineStoryEdit()}>Save notes</button>
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
	{:else}
		{#if data.vocabWordCoverage}
			<div class="lesson-vocab-top" class:expanded={vocabPanelsOpen}>
				<div class="lesson-vocab-top-main">
					<WordCoveragePanel
						title="Next story coverage"
						entries={data.vocabWordCoverage.words}
						storyLesson={data.vocabWordCoverage.storyLesson}
						quickAddAction="?/quickAddWord"
						bind:open={vocabPanelsOpen}
					/>
				</div>
				<CefrBrowseSidebar
					level={data.lesson.level}
					query={data.cefrBrowse.query}
					sort={data.cefrBrowse.sort}
					coverageFilter={data.cefrBrowse.coverageFilter}
					posFilters={data.cefrBrowse.posFilters}
					posOptions={data.cefrBrowse.posOptions}
					targets={data.cefrBrowse.targets}
					page={data.cefrBrowse.page}
					totalPages={data.cefrBrowse.totalPages}
					filteredCount={data.cefrBrowse.filteredCount}
					totalCount={data.cefrBrowse.totalCount}
					coveredCount={data.cefrBrowse.coveredCount}
					buildUrl={buildLessonCefrUrl}
					collapsible
					bind:expanded={vocabPanelsOpen}
				/>
			</div>
		{/if}

		<div class="words-head">
			<div class="words-head-left">
				<div class="words-head-num">{flattenedLessonWords.length}</div>
				<div>
					<h3 class="lesson-section-title">Lesson words</h3>
					<div class="words-head-sub">
						{#if flattenedLessonWords.length === 0}
							No words yet
						{:else if displaySections.length === 1}
							in 1 section
						{:else}
							across {displaySections.length} sections
						{/if}
					</div>
				</div>
			</div>
			<div class="words-head-right">
				{#if flattenedLessonWords.length > 0 && displaySections.length > 1}
					<div class="section-pips">
						{#each displaySections as section}
							<div class="section-pip" title="Section {section.sectionNumber} · {section.items.length} word{section.items.length === 1 ? '' : 's'}">
								<span class="pip-label">S{section.sectionNumber}</span>
								<span class="pip-count">{section.items.length}</span>
							</div>
						{/each}
					</div>
				{/if}
				<button type="button" class="btn ghost" onclick={toggleAddWordForm}>
					{showAddWordForm ? 'Close' : 'Add word'}
				</button>
			</div>
		</div>

		{#if showAddWordForm}
			<section class="card">
				<form
					method="POST"
					action="?/createWord"
					class="editor-form compact-form add-word-form"
					enctype="multipart/form-data"
					use:enhance={enhanceAddWordForm}
				>
					<input type="hidden" name="lessonId" value={data.lesson.id} />

					<LemmaSearchPicker
						searchEndpoint={`/lessons/${data.lesson.id}/word-search`}
						idPrefix="lesson-add-word"
						bind:selectedWord={addWordState.selectedWord}
						bind:mode={addWordState.mode}
						bind:draftKalenjin={addWordState.draftKalenjin}
						bind:draftTranslations={addWordState.draftTranslations}
						bind:draftAlternativeSpellings={addWordState.draftAlternativeSpellings}
						bind:draftNotes={addWordState.draftNotes}
						bind:draftPartOfSpeech={addWordState.draftPartOfSpeech}
						bind:draftPluralForm={addWordState.draftPluralForm}
						bind:draftIsPluralOnly={addWordState.draftIsPluralOnly}
						bind:draftPresentAnee={addWordState.draftPresentAnee}
						bind:draftPresentInyee={addWordState.draftPresentInyee}
						bind:draftPresentInee={addWordState.draftPresentInee}
						bind:draftPresentEchek={addWordState.draftPresentEchek}
						bind:draftPresentOkwek={addWordState.draftPresentOkwek}
						bind:draftPresentIchek={addWordState.draftPresentIchek}
					/>

					<div class="add-word-sentence">
						<label>
							Example sentence
							<textarea
								name="sentenceKalenjin"
								required
								rows="2"
								bind:value={addWordState.sentenceKalenjin}
							></textarea>
						</label>

						<label>
							Sentence translation
							<textarea
								name="sentenceEnglish"
								required
								rows="2"
								bind:value={addWordState.sentenceEnglish}
							></textarea>
						</label>
					</div>

					<div class="add-word-images">
						<ImageUploadField name="wordImage" idPrefix="add-word-image" label="Word image" />
						<ImageUploadField name="sentenceImage" idPrefix="add-sentence-image" label="Sentence image" />
					</div>

					{#if addWordState.error}
						<p class="error-text">{addWordState.error}</p>
					{/if}

					<div class="add-word-actions">
						<button type="submit" class="btn">
							{addWordState.selectedWord
								? `Add "${addWordState.selectedWord.kalenjin}" to lesson`
								: 'Create lesson word'}
						</button>
					</div>
				</form>
			</section>
		{/if}

		{#if flattenedLessonWords.length === 0}
			<section class="content-card">
				<p class="muted">No lesson words yet.</p>
			</section>
		{:else}
			<form
				method="POST"
				action="?/reorderWords"
				class="sr-only"
				bind:this={reorderWordsForm}
				use:enhance={enhanceReorderWordsForm}
			>
				<input type="hidden" name="orderedIds" value={JSON.stringify(lessonWordOrder)} />
				<button type="submit">Save word order</button>
			</form>
			{#if reorderWordsError}
				<p class="error-text">{reorderWordsError}</p>
			{/if}
			<div class="sections-stack" aria-label="Lesson words">
				{#each displaySections as section}
					<section class="content-card section-card">
						<div class="section-label">Section {section.sectionNumber}</div>

						<div class="table-header vocab-grid">
							<span></span>
							<span>Word</span>
							<span>Sentence</span>
							<span>Translation &amp; notes</span>
							<span></span>
						</div>
						<div role="list" aria-label={`Section ${section.sectionNumber}`}>

						{#each section.items as lessonWord}
							{@const lwLocal = getLessonWordLocal(lessonWord)}
							<div
								class="table-row vocab-grid vocab-row"
								role="listitem"
								class:vocab-row--dragging={draggedLessonWordId === lessonWord.id}
								class:vocab-row--drop-target={dropTargetLessonWordId === lessonWord.id}
								ondragover={(event) => handleLessonWordDragOver(event, lessonWord.id)}
								ondragleave={() => handleLessonWordDragLeave(lessonWord.id)}
								ondrop={(event) => handleLessonWordDrop(event, lessonWord.id)}
							>
								<div class="drag-cell">
									<button
										type="button"
										class="drag-handle"
										aria-label={`Move ${getWordLocal(lessonWord).kalenjin}`}
										title="Drag to reorder"
										draggable="true"
										ondragstart={(event) => handleLessonWordDragStart(event, lessonWord.id)}
										ondragend={handleLessonWordDragEnd}
									>
										<svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
											<circle cx="5" cy="3" r="1.2" />
											<circle cx="11" cy="3" r="1.2" />
											<circle cx="5" cy="8" r="1.2" />
											<circle cx="11" cy="8" r="1.2" />
											<circle cx="5" cy="13" r="1.2" />
											<circle cx="11" cy="13" r="1.2" />
										</svg>
									</button>
								</div>
								<div class="word-cell">
									{#if inlineWordEdit?.lessonWordId === lessonWord.id && inlineWordEdit.field === 'kalenjin'}
										<input bind:this={inlineWordInput} class="inline-edit-input word-inline-input word-kalenjin-input" bind:value={inlineWordValue} onkeydown={handleInlineWordKeydown} onblur={() => void saveInlineWordEdit()} />
									{:else}
										<div class="word-kalenjin-row">
											<AudioPlayButton
												audioUrl={lessonWord.word?.audioUrl ?? null}
												size="sm"
												label={`Play pronunciation of ${getWordLocal(lessonWord).kalenjin}`}
											/>
											<button type="button" class="inline-edit-button word-kalenjin" onclick={() => beginInlineWordEdit(lessonWord, 'kalenjin')}>{getWordLocal(lessonWord).kalenjin}</button>
										</div>
									{/if}
									{#if inlineWordEdit?.lessonWordId === lessonWord.id && inlineWordEdit.field === 'translations'}
										<input bind:this={inlineWordInput} class="inline-edit-input word-inline-input word-translations-input" bind:value={inlineWordValue} onkeydown={handleInlineWordKeydown} onblur={() => void saveInlineWordEdit()} />
									{:else}
										<button type="button" class="inline-edit-button word-translations" onclick={() => beginInlineWordEdit(lessonWord, 'translations')}>{stripWordLinks(getWordLocal(lessonWord).translations)}</button>
									{/if}
									{#if inlineWordError && inlineWordEdit?.lessonWordId === lessonWord.id}
										<p class="error-text">{inlineWordError}</p>
									{/if}
								</div>
							<div class="vocab-text-cell">
								{#if inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'sentenceKalenjin'}
									<textarea bind:this={inlineLessonWordInput} class="inline-edit-input" rows="2" bind:value={inlineLessonWordValue} onkeydown={handleInlineLessonWordLineKeydown} onblur={() => void saveInlineLessonWordEdit()}></textarea>
								{:else if !lessonWord.sentence}
									<button type="button" class="inline-edit-button empty-sentence-button" class:sentence-notes-empty={!lwLocal.sentenceKalenjin} onclick={() => beginInlineLessonWordEdit(lessonWord, 'sentenceKalenjin')}>{lwLocal.sentenceKalenjin || 'Add sentence'}</button>
								{:else}
									{@const prevExampleWord = findAdjacentLessonWordWithSentence(
										lessonWord.id,
										'prev'
									)}
									{@const nextExampleWord = findAdjacentLessonWordWithSentence(
										lessonWord.id,
										'next'
									)}
									<div class="sentence-annotation-shell">
										<AudioPlayButton
											audioUrl={lessonWord.sentence.audioUrl}
											size="sm"
											label="Play sentence"
										/>
										<SentenceTokenAnnotations
											entityId={lessonWord.id}
											entityIdField="lessonWordId"
											entityKind="example"
											sentenceId={lessonWord.sentence.id}
											sentenceText={lessonWord.sentence.kalenjin}
											tokens={lessonWord.sentence.tokens}
											dictionaryWords={data.words}
											updateAction="?/updateExampleSentenceToken"
											createAction="?/createExampleSentenceWord"
											searchEndpoint={`/lessons/${data.lesson.id}/word-search`}
											tokenGroupEndpoint={`/lessons/${data.lesson.id}/token-groups`}
											focusRequest={exampleFocusRequests[lessonWord.sentence.id] ?? null}
											onNavigatePrevSentence={prevExampleWord?.sentence
												? () =>
														focusExampleSentence(prevExampleWord.sentence!.id, 'last')
												: undefined}
											onNavigateNextSentence={nextExampleWord?.sentence
												? () =>
														focusExampleSentence(nextExampleWord.sentence!.id, 'first')
												: undefined}
										/>
										<button
											type="button"
											class="btn ghost sentence-edit-button"
											aria-label={replaceSentenceLabel}
											data-tooltip={replaceSentenceLabel}
											onclick={() => beginInlineLessonWordEdit(lessonWord, 'sentenceKalenjin')}
										>
											<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
												<path
													d="M7 7h9.2l-1.8-1.8L16 3.6 20.4 8 16 12.4l-1.6-1.6L16.2 9H7a3 3 0 0 0-3 3v1H2v-1a5 5 0 0 1 5-5Zm10 10H7.8l1.8 1.8L8 20.4 3.6 16 8 11.6l1.6 1.6L7.8 15H17a3 3 0 0 0 3-3v-1h2v1a5 5 0 0 1-5 5Z"
												/>
											</svg>
										</button>
									</div>
								{/if}
								{#if inlineLessonWordError && inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'sentenceKalenjin'}
									<p class="error-text">{inlineLessonWordError}</p>
								{/if}
							</div>
							<div class="translation-cell">
								{#if inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'sentenceEnglish'}
									<textarea bind:this={inlineLessonWordInput} class="inline-edit-input sentence-english-input inline-translation-input" rows="2" bind:value={inlineLessonWordValue} onkeydown={handleInlineLessonWordLineKeydown} onblur={() => void saveInlineLessonWordEdit()}></textarea>
								{:else if lessonWord.sentence}
									<button type="button" class="inline-edit-button sentence-english-text" class:sentence-notes-empty={!lwLocal.sentenceEnglish} onclick={() => beginInlineLessonWordEdit(lessonWord, 'sentenceEnglish')}>
										{#if lwLocal.sentenceEnglish}
											<SentenceTimeText text={lwLocal.sentenceEnglish} />
										{:else}
											{missingSentenceTranslationLabel}
										{/if}
									</button>
								{:else}
									<button type="button" class="inline-edit-button sentence-english-text sentence-notes-empty" disabled>{missingSentenceTranslationLabel}</button>
								{/if}
								{#if inlineLessonWordError && inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'sentenceEnglish'}
									<p class="error-text">{inlineLessonWordError}</p>
								{/if}

								<div class="sentence-notes">
									<div class="notes-label">Notes</div>

									{#if inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'notesMarkdown'}
										<textarea bind:this={inlineLessonWordInput} class="inline-edit-input sentence-notes-input" rows="3" bind:value={inlineLessonWordValue} onkeydown={handleInlineLessonWordKeydown}></textarea>
										<div class="inline-actions compact-actions">
											<button type="button" class="btn btn-sm" onclick={() => void saveInlineLessonWordEdit()}>Save notes</button>
											<button type="button" class="btn ghost btn-sm" onclick={cancelInlineLessonWordEdit}>Cancel</button>
										</div>
									{:else}
										<button type="button" class="inline-edit-button sentence-notes-text" class:sentence-notes-empty={!lwLocal.notesMarkdown} onclick={() => beginInlineLessonWordEdit(lessonWord, 'notesMarkdown')}>{lwLocal.notesMarkdown || 'Add notes'}</button>
									{/if}
									{#if inlineLessonWordError && inlineLessonWordEdit?.lessonWordId === lessonWord.id && inlineLessonWordEdit.field === 'notesMarkdown'}
										<p class="error-text">{inlineLessonWordError}</p>
									{/if}
								</div>
							</div>
							<div class="row-action">
								<form
									method="POST"
									action="?/deleteWord"
									class="inline-delete"
									onsubmit={(event) =>
										requestDeleteWord(
											event,
											getWordLocal(lessonWord).kalenjin || lessonWord.kalenjin
										)}
								>
									<input type="hidden" name="id" value={lessonWord.id} />
									<button type="submit" class="btn ghost btn-sm">Delete</button>
								</form>
							</div>
						</div>

						{@const cefrCovered = getCefrCoveredTargets(lessonWord)}
						{@const cefrSuggestions = getCefrSuggestions(lessonWord)}
						{@const cefrResults = getCefrSearchResults(lessonWord)}
						{@const cefrResultCount = getCefrSearchResultCount(lessonWord)}
						<div class="cefr-row">
							<span class="cefr-label">CEFR</span>
							<div class="cefr-pills">
								{#each cefrCovered as target}
									<span class="cefr-pill cefr-pill--covered">
										<span class="cefr-pill-level">{target.level}</span>
										{target.english}
										<button
											type="button"
											class="cefr-pill-btn"
											aria-label={`Remove ${target.level} ${target.english}`}
											title="Remove"
											onclick={() => void removeCefrTarget(lessonWord.id, target.id)}
										>
											×
										</button>
									</span>
								{/each}

								{#each cefrSuggestions as suggestion}
									<span class="cefr-pill cefr-pill--suggest">
										<span class="cefr-pill-level">{suggestion.level}</span>
										{suggestion.english}
										<button
											type="button"
											class="cefr-pill-btn cefr-pill-btn--confirm"
											aria-label={`Confirm ${suggestion.level} ${suggestion.english}`}
											title="Confirm"
											onclick={() => void addCefrTarget(lessonWord.id, suggestion.id)}
										>
											✓
										</button>
										<button
											type="button"
											class="cefr-pill-btn"
											aria-label={`Dismiss ${suggestion.level} ${suggestion.english}`}
											title="Dismiss"
											onclick={() => dismissCefrSuggestion(lessonWord.id, suggestion.id)}
										>
											×
										</button>
									</span>
								{/each}

								<div class="cefr-search-wrap">
									<input
										type="text"
										class="cefr-search-input"
										placeholder="Search CEFR words..."
										value={cefrSearchQuery.get(lessonWord.id) ?? ''}
										autocomplete="off"
										oninput={(e) => {
											cefrSearchQuery = new Map(cefrSearchQuery).set(lessonWord.id, e.currentTarget.value);
											cefrSearchOpen = new Map(cefrSearchOpen).set(lessonWord.id, true);
										}}
										onfocus={() => {
											cefrSearchOpen = new Map(cefrSearchOpen).set(lessonWord.id, true);
										}}
										onblur={() =>
											window.setTimeout(() => {
												cefrSearchOpen = new Map(cefrSearchOpen).set(lessonWord.id, false);
											}, 150)}
									/>
									{#if cefrSearchOpen.get(lessonWord.id) && cefrResults.length > 0}
										<ul class="cefr-search-dropdown">
											{#each cefrResults as result}
												{@const resultUsed = isCefrTargetUsedByAnotherWord(result, lessonWord.id)}
												<li>
													<button
														type="button"
														class:cefr-search-result--used={resultUsed}
														disabled={resultUsed}
														title={resultUsed ? 'Already attached to another lesson word' : undefined}
														onmousedown={(event) => {
															event.preventDefault();
															if (resultUsed) return;
															void addCefrTarget(lessonWord.id, result.id);
															resetCefrSearch(lessonWord.id);
														}}
													>
														<span class="cefr-pill-level">{result.level}</span>
														<span class="cefr-search-result-text">{result.english}</span>
														{#if resultUsed}
															<span class="cefr-search-result-note">used</span>
														{/if}
													</button>
												</li>
											{/each}
											{#if cefrResultCount > cefrResults.length}
												<li class="cefr-search-more">
													...and {cefrResultCount - cefrResults.length} more
												</li>
											{/if}
										</ul>
									{/if}
								</div>
								{#if cefrErrors.get(lessonWord.id)}
									<p class="error-text cefr-error">{cefrErrors.get(lessonWord.id)}</p>
								{/if}
							</div>
						</div>

						{/each}
						</div>
					</section>
				{/each}
			</div>
		{/if}
	{/if}
</section>

<ConfirmDialog
	open={pendingDelete !== null}
	title={pendingDelete?.kind === 'lesson' ? 'Delete lesson?' : 'Delete word?'}
	message={pendingDelete?.kind === 'lesson'
		? `"${lessonTitle}" will be removed along with its words and sentences. Dictionary entries stay.`
		: pendingDelete?.kind === 'word'
			? `Remove "${pendingDelete.wordLabel}" from this lesson?`
			: ''}
	confirmLabel={pendingDelete?.kind === 'lesson' ? 'Delete lesson' : 'Delete word'}
	variant="danger"
	onconfirm={confirmPendingDelete}
	oncancel={cancelPendingDelete}
/>

<style>
	.lesson-page {
		display: grid;
		gap: 1rem;
	}

	.lesson-vocab-top {
		display: grid;
		gap: 1.5rem;
		margin-bottom: 1rem;
	}

	.lesson-vocab-top-main {
		min-width: 0;
	}

	.lesson-vocab-top :global(.coverage-card),
	.lesson-vocab-top :global(.cefr-sidebar) {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.lesson-vocab-top :global(.coverage-list),
	.lesson-vocab-top :global(.cefr-target-list) {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	@media (min-width: 1100px) {
		.lesson-vocab-top {
			grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
			align-items: stretch;
		}

		.lesson-vocab-top.expanded :global(.coverage-card),
		.lesson-vocab-top.expanded :global(.cefr-sidebar) {
			height: 520px;
		}
	}

	.lesson-head-row {
		align-items: flex-start;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
	}

	.page-header-main {
		display: grid;
		gap: 0.2rem;
		min-width: 0;
	}

	.lesson-head-actions {
		align-items: flex-end;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.page-header-main > :global(.back-link) {
		margin-top: -24px;
		margin-bottom: 8px;
	}

	.lesson-nav-icon {
		color: inherit;
		display: inline-block;
		padding: 0.5em 0.6em;
		margin: -0.5em 0;
		text-decoration: none;
	}
	.lesson-nav-icon:hover {
		color: var(--brand);
	}

	.lesson-delete-form {
		margin: 0;
	}

	.kicker {
		color: var(--accent);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.16em;
		margin-bottom: 6px;
		text-transform: uppercase;
	}

	h1 {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 2.5rem;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1.1;
		margin: 0;
	}

	.title-button {
		background: transparent;
		border: 0;
		cursor: text;
		display: inline-block;
		margin: 0;
		padding: 0;
		text-align: left;
	}

	.title-button h1 {
		border-bottom: 1px dashed transparent;
		margin: 0;
		transition: border-color 0.15s;
	}

	.title-button:hover h1,
	.title-button:focus-visible h1 {
		border-bottom-color: var(--line);
	}

	.title-input {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 2.5rem;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1.1;
		margin: 0;
		padding: 0.15rem 0.5rem;
		width: 100%;
	}

	.title-input:focus {
		border-color: var(--brand);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand) 18%, transparent);
		outline: none;
	}

	.vocab-type-select-wrap {
		display: inline-block;
		position: relative;
	}

	.vocab-type-trigger {
		align-items: baseline;
		background: transparent;
		border: 0;
		border-bottom: 1px dotted currentColor;
		color: inherit;
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		gap: 4px;
		letter-spacing: inherit;
		padding: 0 2px;
		text-transform: inherit;
	}

	.vocab-type-trigger:hover,
	.vocab-type-trigger:focus-visible {
		color: var(--brand);
		outline: none;
	}

	.vocab-type-menu {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 12px 28px -14px oklch(0.2 0.02 80 / 0.28);
		left: 0;
		list-style: none;
		margin: 6px 0 0;
		min-width: 100%;
		padding: 4px;
		position: absolute;
		top: 100%;
		z-index: 30;
	}

	.vocab-type-option {
		background: transparent;
		border: 0;
		border-radius: calc(var(--radius) - 2px);
		color: var(--ink);
		cursor: pointer;
		display: block;
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0;
		padding: 8px 12px;
		text-align: left;
		text-transform: none;
		white-space: nowrap;
		width: 100%;
	}

	.vocab-type-option:hover,
	.vocab-type-option:focus-visible {
		background: var(--surface);
		outline: none;
	}

	.vocab-type-option--selected {
		color: var(--brand);
	}

	.lesson-nav-select-wrap {
		display: inline-block;
		position: relative;
	}

	.lesson-nav-trigger {
		background: transparent;
		border: 0;
		border-bottom: 1px dotted currentColor;
		color: inherit;
		cursor: pointer;
		font: inherit;
		letter-spacing: inherit;
		padding: 0 2px;
		text-transform: inherit;
	}

	.lesson-nav-trigger:hover,
	.lesson-nav-trigger:focus-visible {
		color: var(--brand);
		outline: none;
	}

	.lesson-nav-menu {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 12px 28px -14px oklch(0.2 0.02 80 / 0.28);
		left: 0;
		list-style: none;
		margin: 6px 0 0;
		max-height: 60vh;
		min-width: 280px;
		overflow-y: auto;
		padding: 4px;
		position: absolute;
		top: 100%;
		z-index: 30;
	}

	.lesson-nav-option {
		align-items: baseline;
		background: transparent;
		border: 0;
		border-left: 3px solid transparent;
		border-radius: calc(var(--radius) - 2px);
		color: var(--ink);
		cursor: pointer;
		display: flex;
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 500;
		gap: 8px;
		letter-spacing: 0;
		padding: 8px 12px;
		text-align: left;
		text-decoration: none;
		text-transform: none;
		white-space: nowrap;
		width: 100%;
	}

	.lesson-nav-option:hover,
	.lesson-nav-option:focus-visible {
		background: var(--surface);
		outline: none;
	}

	.lesson-nav-option--vocab {
		border-left-color: var(--brand);
	}

	.lesson-nav-option--story {
		border-left-color: var(--accent);
	}

	.lesson-nav-option--current {
		color: var(--muted);
		cursor: default;
		opacity: 0.6;
	}

	.lesson-nav-option--current:hover {
		background: transparent;
	}

	.lesson-nav-option-number {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		min-width: 1.75em;
	}

	.lesson-nav-option--current .lesson-nav-option-number {
		color: inherit;
	}

	.lesson-nav-option-title {
		color: inherit;
	}

	.card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
	}

	.content-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: 1rem 1.25rem;
	}

	.words-head {
		align-items: center;
		border-bottom: 1px solid var(--line);
		display: flex;
		gap: 24px;
		justify-content: space-between;
		margin: 12px 0 18px;
		padding-bottom: 18px;
	}

	.words-head-left {
		align-items: center;
		display: flex;
		gap: 20px;
	}

	.words-head-num {
		color: var(--brand);
		font-family: var(--font-display);
		font-size: 56px;
		font-variant-numeric: tabular-nums;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1;
	}

	.lesson-section-title {
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 500;
		margin: 0;
	}

	.words-head-sub {
		color: var(--ink-soft);
		font-size: 14px;
		margin-top: 2px;
	}

	.words-head-right {
		align-items: center;
		display: flex;
		gap: 16px;
	}

	.section-pips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.section-pip {
		align-items: baseline;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		display: flex;
		font-family: var(--font-mono);
		font-size: 13px;
		gap: 6px;
		padding: 8px 12px;
	}

	.pip-label {
		color: var(--ink-mute);
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.pip-count {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 18px;
		font-variant-numeric: tabular-nums;
		font-weight: 500;
	}

	.sections-stack {
		display: grid;
		gap: 1rem;
	}

	.section-card {
		padding: 1.25rem 1.25rem 0.5rem;
	}

	.section-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.16em;
		margin: 0 0 0.75rem;
		text-align: right;
		text-transform: uppercase;
	}

	.notes-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.14em;
		margin-bottom: 2px;
		text-transform: uppercase;
	}

	.error {
		color: oklch(0.45 0.15 25);
		font-weight: 600;
	}

	.success {
		color: oklch(0.45 0.15 150);
		font-weight: 600;
	}

	.error-text {
		color: oklch(0.45 0.15 25);
		font-weight: 600;
	}

	.sr-only {
		height: 1px;
		margin: -1px;
		overflow: hidden;
		padding: 0;
		position: absolute;
		width: 1px;
	}

	.editor-form {
		display: grid;
		gap: 0.75rem;
	}

	.compact-form {
		max-width: 980px;
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

	.sentence-notes {
		border-top: 1px solid var(--line-soft);
		display: grid;
		gap: 0.3rem;
		padding-top: 0.45rem;
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

	.inline-edit-button--quiet {
		color: var(--ink-mute);
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

	.compact-actions {
		gap: 0.45rem;
	}

	.vocab-grid {
		grid-template-columns: 2rem minmax(150px, 0.8fr) minmax(320px, 2fr) minmax(240px, 1.4fr) auto;
	}

	.vocab-row {
		transition: background 0.12s ease, opacity 0.12s ease;
	}

	.vocab-row:hover {
		background: var(--surface);
	}

	.vocab-row--dragging {
		opacity: 0.5;
	}

	.vocab-row--drop-target {
		background: color-mix(in oklch, var(--brand) 8%, transparent);
		box-shadow: inset 0 2px 0 var(--brand);
	}

	.drag-cell {
		align-items: start;
		display: flex;
		justify-content: center;
	}

	.drag-handle {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: var(--radius);
		color: var(--ink-mute);
		cursor: grab;
		display: inline-flex;
		height: 2rem;
		justify-content: center;
		padding: 0;
		width: 1.75rem;
	}

	.drag-handle:hover,
	.drag-handle:focus-visible {
		background: var(--surface);
		color: var(--ink);
	}

	.drag-handle:active {
		cursor: grabbing;
	}

	.drag-handle svg {
		fill: currentColor;
		height: 1rem;
		width: 1rem;
	}

	.word-cell {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.word-kalenjin {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 500;
	}

	.word-kalenjin-row {
		align-items: center;
		display: flex;
		gap: 0.4rem;
	}

	.word-translations {
		color: var(--ink-soft);
		font-size: 13px;
	}

	.word-inline-input {
		background: transparent;
		border: 0;
		border-bottom: 1px solid transparent;
		outline: none;
		padding: 0;
		width: 100%;
	}

	.word-inline-input:focus {
		border-bottom-color: var(--brand);
	}

	.word-translations-input {
		color: var(--ink-soft);
		font-size: 13px;
	}

	.vocab-text-cell {
		align-self: stretch;
		min-width: 0;
	}

	.sentence-annotation-shell {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.sentence-edit-button {
		align-items: center;
		border-radius: var(--radius);
		display: inline-flex;
		height: 2rem;
		justify-content: center;
		padding: 0;
		position: relative;
		width: 2rem;
	}

	.sentence-edit-button svg {
		fill: currentColor;
		height: 1rem;
		width: 1rem;
	}

	.sentence-edit-button::after {
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

	.sentence-edit-button:hover::after,
	.sentence-edit-button:focus-visible::after {
		opacity: 1;
	}

	.empty-sentence-button {
		align-items: center;
		border: 1px dashed var(--line);
		border-radius: var(--radius);
		box-sizing: border-box;
		color: var(--ink-mute);
		display: flex;
		min-height: 4.5rem;
		padding: 0.45rem 0.5rem;
		width: 100%;
	}

	.empty-sentence-button:hover {
		background: var(--surface);
		border-color: var(--ink-mute);
		color: var(--ink);
	}

	.sentence-english-text {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 16px;
		font-style: italic;
	}

	.sentence-english-input {
		font-family: var(--font-display);
		font-style: italic;
	}

	.sentence-notes-text {
		color: var(--ink-soft);
		font-size: 13px;
		line-height: 1.45;
		white-space: pre-wrap;
	}

	.sentence-notes-empty {
		color: var(--ink-mute);
	}

	.row-action {
		align-items: start;
		display: flex;
		gap: 0.4rem;
		justify-content: end;
		padding-right: 0.5rem;
	}

	.cefr-row {
		align-items: start;
		display: grid;
		gap: 0.6rem;
		grid-template-columns: auto minmax(0, 1fr);
		padding: 0 0 0.5rem;
	}

	.cefr-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		padding-top: 0.3rem;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.cefr-pills {
		align-items: center;
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		gap: 0.35rem;
		min-width: 0;
	}

	.cefr-pill {
		align-items: center;
		background: color-mix(in oklch, var(--accent) 10%, transparent);
		border: 1px solid color-mix(in oklch, var(--accent) 35%, transparent);
		border-radius: 3px;
		color: var(--accent);
		display: inline-flex;
		flex: 0 1 auto;
		font-size: 11px;
		gap: 0.3rem;
		line-height: 1.2;
		max-width: 100%;
		min-width: 0;
		overflow-wrap: anywhere;
		padding: 2px 6px;
	}

	.cefr-pill--covered:hover {
		border-color: var(--accent);
	}

	.cefr-pill--suggest {
		background: color-mix(in oklch, var(--accent) 5%, transparent);
		border-color: color-mix(in oklch, var(--accent) 25%, transparent);
		border-style: dashed;
	}

	.cefr-pill-level {
		color: var(--ink-soft);
		font-weight: 600;
	}

	.cefr-pill-btn {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: 2px;
		color: var(--ink-mute);
		cursor: pointer;
		display: inline-flex;
		font-size: 0.85rem;
		height: 1.25rem;
		justify-content: center;
		line-height: 1;
		margin-left: 0.05rem;
		padding: 0;
		width: 1.25rem;
	}

	.cefr-pill-btn:hover {
		background: color-mix(in oklch, var(--ink) 8%, transparent);
		color: var(--ink);
	}

	.cefr-pill-btn--confirm {
		color: oklch(0.45 0.15 150);
	}

	.cefr-search-wrap {
		min-width: 12rem;
		position: relative;
	}

	.cefr-search-input {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-sizing: border-box;
		color: var(--ink);
		font-size: 0.85rem;
		padding: 0.3rem 0.55rem;
		transition: border-color 0.15s, box-shadow 0.15s;
		width: 100%;
	}

	.cefr-search-input:focus {
		border-color: var(--brand);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand) 18%, transparent);
		outline: none;
	}

	.cefr-search-dropdown {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 8px 24px -12px oklch(0.2 0.02 80 / 0.25);
		list-style: none;
		margin: 0.2rem 0 0;
		max-height: 12rem;
		overflow-y: auto;
		padding: 0;
		position: absolute;
		width: min(22rem, 80vw);
		z-index: 10;
	}

	.cefr-search-dropdown li button {
		align-items: center;
		background: transparent;
		border: 0;
		color: var(--ink);
		cursor: pointer;
		display: flex;
		gap: 0.45rem;
		padding: 0.4rem 0.55rem;
		text-align: left;
		width: 100%;
	}

	.cefr-search-dropdown li button:hover {
		background: var(--surface);
	}

	.cefr-search-dropdown li button:disabled {
		color: var(--ink-mute);
		cursor: not-allowed;
	}

	.cefr-search-dropdown li button:disabled:hover {
		background: transparent;
	}

	.cefr-search-result--used .cefr-search-result-text {
		text-decoration: line-through;
	}

	.cefr-search-result-note {
		color: var(--ink-mute);
		font-size: 0.8rem;
		margin-left: auto;
	}

	.cefr-search-more {
		color: var(--ink-mute);
		font-size: 0.82rem;
		padding: 0.35rem 0.55rem;
	}

	.cefr-error {
		flex-basis: 100%;
		font-size: 0.85rem;
		margin: 0;
	}

	label {
		display: grid;
		gap: 0.25rem;
	}

	.inline-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.inline-delete {
		margin: 0;
	}

	.inline-delete button {
		transition: background-color 0.15s, border-color 0.15s, color 0.15s;
	}

	.inline-delete button:hover,
	.inline-delete button:focus-visible {
		background: oklch(0.96 0.02 25);
		border-color: oklch(0.85 0.06 25);
		color: oklch(0.45 0.15 25);
		outline: none;
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

	.inline-edit-button.word-kalenjin {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 500;
	}

	.inline-edit-button.sentence-english-text {
		font-family: var(--font-display);
		font-style: italic;
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

	.add-word-form {
		display: grid;
		gap: 16px;
	}

	.add-word-sentence {
		border-top: 1px dotted var(--line);
		display: grid;
		gap: 0.75rem;
		padding-top: 16px;
	}

	.add-word-sentence label {
		display: grid;
		gap: 4px;
	}

	.add-word-sentence textarea {
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: 8px;
		font: inherit;
		padding: 8px 10px;
	}

	.add-word-actions {
		display: flex;
		justify-content: flex-end;
	}

	.add-word-images {
		border-top: 1px dotted var(--line);
		display: grid;
		gap: 16px;
		grid-template-columns: 1fr 1fr;
		padding-top: 16px;
	}

	@media (max-width: 640px) {
		.add-word-images {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 800px) {
		.lesson-head-row,
		.words-head,
		.story-grid,
		.cefr-row,
		.vocab-grid {
			display: grid;
			grid-template-columns: 1fr;
		}

		.words-head-right {
			justify-content: flex-start;
		}

		.row-action {
			justify-content: start;
		}
	}
</style>
