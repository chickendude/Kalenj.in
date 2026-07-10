<script lang="ts">
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import TokenHoverPreview from '$lib/components/TokenHoverPreview.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import TypedAnswerSlots from '$lib/components/learn/TypedAnswerSlots.svelte';
	import { playCorrectSound, playIncorrectSound } from '$lib/learn/feedback-sounds';
	import { onLearnShortcut } from '$lib/learn/shortcuts';
	import {
		acceptableAnswers,
		isTypeableChar,
		normalizeAnswerChar,
		normalizeTypedAnswer,
		typeableText,
		type BlankResolution,
		type LearnLessonWord,
		type RecallMode
	} from '$lib/learn/lesson-steps';
	import { stripWordLinks } from '$lib/word-links';
	import type { RecallResult } from '$lib/srs';

	let {
		lessonWord,
		blanks,
		mode = 'text',
		onResult,
		onNext = null
	}: {
		lessonWord: LearnLessonWord;
		blanks: BlankResolution;
		mode?: RecallMode;
		onResult: (result: RecallResult) => void;
		/** Renders a Next button in the answered state (lesson flow only). */
		onNext?: (() => void) | null;
	} = $props();

	const prompt = $derived(stripWordLinks(lessonWord.translations));
	const sentence = $derived(blanks.kind === 'sentence' ? (lessonWord.sentence ?? null) : null);
	const isAudioMode = $derived(mode === 'audio' && Boolean(sentence?.audioUrl));
	const sentenceTranslation = $derived(
		lessonWord.sentenceTranslation?.trim() || lessonWord.sentence?.english || ''
	);
	const orderedTokens = $derived(
		sentence ? [...sentence.tokens].sort((a, b) => a.tokenOrder - b.tokenOrder) : []
	);
	// Dictation covers the whole sentence — every token becomes a blank.
	const effectiveBlanks = $derived(
		isAudioMode && sentence
			? {
					kind: 'sentence' as const,
					blankTokenOrders: orderedTokens.map((token) => token.tokenOrder),
					target: orderedTokens.map((token) => token.surfaceForm).join(' ')
				}
			: blanks
	);
	const target = $derived(effectiveBlanks.target);
	/** Characters the learner actually types (letters, digits, apostrophes). */
	const typeableTarget = $derived(typeableText(target));
	const blankTokenOrders = $derived(
		effectiveBlanks.kind === 'sentence'
			? new Set(effectiveBlanks.blankTokenOrders)
			: new Set<number>()
	);
	/** Consecutive blanked tokens collapse into the single slot group. */
	const firstBlankTokenOrder = $derived(
		effectiveBlanks.kind === 'sentence' ? Math.min(...effectiveBlanks.blankTokenOrders) : -1
	);

	let typed = $state('');
	/** Ghost-revealed target letters (typeable index); the learner types over them. */
	let hintedUpTo = $state(0);
	/** Caret position inside `typed`, mirrored from the hidden input. */
	let caretIndex = $state(0);
	let done = $state(false);
	let correct = $state(false);
	let usedHint = $state(false);
	let wrongSubmits = $state(0);
	let revealed = $state(false);
	let translationShown = $state(false);
	let shake = $state(false);
	let focused = $state(false);
	/** The attempt that was last submitted — slots only show colors for it. */
	let gradedAttempt = $state<string | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);
	let audioButton = $state<ReturnType<typeof AudioPlayButton> | null>(null);

	const accepted = $derived(acceptableAnswers(lessonWord, target));
	const showGrading = $derived(done || (gradedAttempt !== null && gradedAttempt === typed));
	// What this word means *in this sentence*, when the corpus records it.
	const contextTranslation = $derived.by(() => {
		const parts = orderedTokens
			.filter((token) => blankTokenOrders.has(token.tokenOrder))
			.map((token) => token.inContextTranslation?.trim())
			.filter((part): part is string => Boolean(part));
		return parts.length > 0 ? parts.join(' ') : null;
	});
	// Once answered, the sentence renders with hover pop-up definitions instead.
	// The contextual translation leads; the dictionary entry hangs under it.
	const slotsLabel = $derived(!done && !isAudioMode ? (contextTranslation ?? prompt) : null);
	const slotsSubLabel = $derived(
		!done && !isAudioMode && contextTranslation &&
		contextTranslation.toLocaleLowerCase() !== prompt.trim().toLocaleLowerCase()
			? prompt
			: null
	);

	// Text drills show the full sentence translation up front; dictation keeps
	// it hidden so the challenge stays on the listening.
	const showTranslation = $derived(done || translationShown || (!isAudioMode && Boolean(sentence)));

	const kicker = $derived(
		blanks.kind !== 'sentence'
			? 'Type the word'
			: isAudioMode
				? 'Type what you hear'
				: 'Fill in the blank'
	);

	/**
	 * Mirror the target's capitals onto the typed answer (sentence starts,
	 * proper nouns) — case is never graded, so the learner shouldn't have to
	 * reach for Shift. Lowercase input is only ever upcased, never the
	 * reverse.
	 */
	function matchTargetCase(value: string): string {
		return [...value]
			.map((char, index) => {
				const targetChar = typeableTarget[index];
				return targetChar && targetChar !== targetChar.toLocaleLowerCase()
					? char.toLocaleUpperCase()
					: char;
			})
			.join('');
	}

	function handleInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const raw = input.value;
		const rawCaret = input.selectionStart ?? raw.length;
		// Drop non-typeable characters, remembering how many sat before the
		// caret so the caret can be restored after the value is rewritten.
		let removedBeforeCaret = 0;
		const kept: string[] = [];
		[...raw].forEach((char, index) => {
			if (isTypeableChar(char)) kept.push(char);
			else if (index < rawCaret) removedBeforeCaret += 1;
		});
		typed = matchTargetCase(kept.join('').slice(0, typeableTarget.length));
		input.value = typed;
		caretIndex = Math.min(Math.max(0, rawCaret - removedBeforeCaret), typed.length);
		input.setSelectionRange(caretIndex, caretIndex);
		gradedAttempt = null;
	}

	function finish(asRevealed: boolean) {
		done = true;
		revealed = asRevealed;
		correct = !asRevealed;
		translationShown = true;
		inputEl?.blur();
		if (asRevealed) {
			playIncorrectSound();
		} else {
			playCorrectSound();
		}
		onResult({ correct: !asRevealed, usedHint, wrongSubmits, revealed: asRevealed });
	}

	function submit() {
		if (done || typed.length === 0) return;
		const normalizedTyped = normalizeTypedAnswer(typed);
		if (accepted.has(normalizedTyped)) {
			// Accepted (possibly a spelling variant) — settle on the lesson's form.
			typed = typeableTarget;
			finish(false);
		} else {
			gradedAttempt = typed;
			wrongSubmits += 1;
			playIncorrectSound();
			shake = true;
			setTimeout(() => (shake = false), 400);
		}
	}

	function hint() {
		if (done) return;
		usedHint = true;
		// If anything typed is wrong, trim back so the ghost shows the
		// correction there; otherwise reveal the next letter. The ghost is
		// only a suggestion — the learner still types it themselves.
		let fixIndex = typed.length;
		for (let i = 0; i < typed.length; i += 1) {
			if (normalizeAnswerChar(typed[i]) !== normalizeAnswerChar(typeableTarget[i] ?? '')) {
				fixIndex = i;
				break;
			}
		}
		typed = typed.slice(0, fixIndex);
		// The hidden input isn't value-bound; keep it in step with the trim.
		if (inputEl) {
			inputEl.value = typed;
			inputEl.setSelectionRange(typed.length, typed.length);
		}
		caretIndex = typed.length;
		hintedUpTo = Math.min(Math.max(hintedUpTo, typed.length) + 1, typeableTarget.length);
		gradedAttempt = null;
		inputEl?.focus();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			submit();
		}
	}

	function focusInput() {
		if (!done) inputEl?.focus();
	}

	/** Clicking a slot moves the caret there (clamped to the typed prefix). */
	function placeCaret(index: number) {
		if (done || !inputEl) return;
		const clamped = Math.min(Math.max(0, index), typed.length);
		inputEl.focus();
		inputEl.setSelectionRange(clamped, clamped);
		caretIndex = clamped;
	}

	$effect(() => {
		inputEl?.focus();
		// Focus events can be swallowed in background tabs; sync the flag.
		if (inputEl && document.activeElement === inputEl) focused = true;
	});

	$effect(() =>
		onLearnShortcut((action) => {
			if (action === 'audio') audioButton?.play();
			else if (action === 'translate') translationShown = !translationShown;
			else if (action === 'hint') hint();
		})
	);

	// Arrow keys / Home / End move the native caret in the hidden input;
	// mirror it so the visible caret in the slots follows.
	$effect(() => {
		function syncCaret() {
			if (inputEl && document.activeElement === inputEl) {
				caretIndex = Math.min(inputEl.selectionStart ?? typed.length, typed.length);
			}
		}
		document.addEventListener('selectionchange', syncCaret);
		return () => document.removeEventListener('selectionchange', syncCaret);
	});
</script>

<!-- Clicking anywhere on the exercise refocuses the hidden input; keyboard users are already in it. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="recall" class:shake onclick={focusInput}>
	<div class="recall-kicker">{kicker}</div>

	{#if isAudioMode && !done}
		<div class="listen-row">
			<AudioPlayButton
				bind:this={audioButton}
				audioUrl={sentence?.audioUrl}
				label="Play sentence audio"
				autoplay
			/>
		</div>
	{/if}

	<div class="recall-sentence" class:word-only={effectiveBlanks.kind !== 'sentence'}>
		{#if done && sentence}
			<TokenHoverPreview
				sentenceId={sentence.id}
				sentenceText={sentence.kalenjin}
				tokens={sentence.tokens}
				onTokenClick={() => {}}
			/>
		{:else if effectiveBlanks.kind === 'sentence'}
			{#each orderedTokens as token (token.id)}
				{#if blankTokenOrders.has(token.tokenOrder)}
					{#if token.tokenOrder === firstBlankTokenOrder}
						<TypedAnswerSlots
							{target}
							{typed}
							{done}
							graded={showGrading}
							{hintedUpTo}
							{caretIndex}
							active={focused && !done}
							label={slotsLabel}
							subLabel={slotsSubLabel}
							onSlotClick={placeCaret}
						/>
					{/if}
				{:else}
					<span class="context-token">{token.surfaceForm}</span>
				{/if}
			{/each}
		{:else}
			<TypedAnswerSlots
				{target}
				{typed}
				{done}
				graded={showGrading}
				{hintedUpTo}
				{caretIndex}
				active={focused && !done}
				label={slotsLabel}
				subLabel={slotsSubLabel}
				onSlotClick={placeCaret}
			/>
		{/if}
	</div>

	{#if showTranslation && sentence}
		<p class="sentence-translation">{sentenceTranslation}</p>
	{/if}

	<input
		bind:this={inputEl}
		class="hidden-input"
		type="text"
		autocomplete="off"
		autocapitalize="off"
		spellcheck="false"
		aria-label="Type the missing answer"
		disabled={done}
		oninput={handleInput}
		onkeydown={handleKeydown}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
	/>

	<div class="recall-actions">
		{#if !done}
			<Tooltip label="Reveal next letter">
				<button type="button" class="icon-btn" onclick={hint} aria-label="Hint">
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M9 18h6" />
						<path d="M10 21h4" />
						<path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z" />
					</svg>
				</button>
			</Tooltip>
			{#if sentence && isAudioMode}
				<Tooltip
					label={translationShown ? 'Hide sentence translation' : 'Show sentence translation'}
				>
					<button
						type="button"
						class="icon-btn"
						onclick={() => (translationShown = !translationShown)}
						aria-pressed={translationShown}
						aria-label={translationShown
							? 'Hide sentence translation'
							: 'Show sentence translation'}
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="9" />
							<path d="M3 12h18" />
							<path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18z" />
						</svg>
					</button>
				</Tooltip>
			{/if}
			<!-- No sentence audio before answering in fill-in-the-blank mode: the
			     recording speaks the missing word, which would give it away. The
			     answered state (below) has the player, with autoplay. -->
			<span class="spacer"></span>
			<Tooltip label="Check your answer">
				<button
					type="button"
					class="icon-btn primary"
					onclick={submit}
					disabled={typed.length === 0}
					aria-label="Check answer"
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="m4 12.5 5 5L20 7" />
					</svg>
				</button>
			</Tooltip>
		{:else}
			<div class="result" role="status">
				<span class="visually-hidden">{correct ? 'Correct' : `The answer was ${target}`}</span>
				{#if !correct && !sentence}
					The answer was <strong>{target}</strong>
				{/if}
			</div>
			<span class="spacer"></span>
			{#if sentence?.audioUrl}
				<AudioPlayButton
					bind:this={audioButton}
					audioUrl={sentence.audioUrl}
					label="Play sentence audio"
					autoplay
				/>
			{/if}
			{#if onNext}
				<button type="button" class="btn next-btn" onclick={onNext} aria-label="Next">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M5 12h14" />
						<path d="m13 6 6 6-6 6" />
					</svg>
				</button>
			{/if}
		{/if}
	</div>
</div>

<style>
	.recall {
		align-items: start;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		height: 100%;
		text-align: left;
	}

	.recall.shake {
		animation: recall-shake 0.35s ease;
	}

	@keyframes recall-shake {
		0%,
		100% {
			transform: translateX(0);
		}
		25% {
			transform: translateX(-5px);
		}
		75% {
			transform: translateX(5px);
		}
	}

	.recall-kicker {
		color: var(--accent);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.listen-row {
		align-items: center;
		display: flex;
		gap: 0.7rem;
	}

	.recall-sentence {
		align-items: baseline;
		display: flex;
		flex-wrap: wrap;
		font-family: var(--font-display, inherit);
		font-size: 1.5rem;
		gap: 0.25em 0.45em;
		line-height: 1.7;
	}

	.recall-sentence.word-only {
		font-size: 1.8rem;
	}

	.context-token {
		white-space: nowrap;
	}

	.sentence-translation {
		color: var(--ink-soft);
		font-size: 0.98rem;
		margin: 0;
	}

	.hidden-input {
		border: none;
		height: 1px;
		opacity: 0.01;
		padding: 0;
		position: absolute;
		width: 1px;
	}

	.recall-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: auto;
		padding-top: 0.9rem;
		width: 100%;
	}

	.spacer {
		flex: 1;
	}

	/* Same footprint as the audio play button so the action row is uniform. */
	.icon-btn {
		align-items: center;
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 50%;
		color: var(--ink-mute);
		cursor: pointer;
		display: inline-flex;
		flex-shrink: 0;
		height: 44px;
		justify-content: center;
		padding: 0;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
		width: 44px;
	}

	.icon-btn:hover:not(:disabled) {
		background: var(--surface, var(--bg-raised));
		color: var(--ink);
	}

	.icon-btn[aria-pressed='true'] {
		border-color: var(--brand);
		color: var(--brand);
	}

	.icon-btn.primary {
		background: var(--brand);
		border-color: var(--brand);
		color: var(--on-brand, #fff);
	}

	.icon-btn.primary:hover:not(:disabled) {
		background: var(--brand);
		color: var(--on-brand, #fff);
		filter: brightness(1.08);
	}

	.icon-btn:disabled {
		cursor: default;
		opacity: 0.45;
	}

	/* Same footprint as the audio play button beside it (and the lesson
	   player's Next). */
	.next-btn {
		align-items: center;
		border-radius: 50%;
		display: inline-flex;
		height: 44px;
		justify-content: center;
		padding: 0;
		width: 44px;
	}

	.result {
		color: var(--ink-soft);
		font-size: 0.98rem;
	}

	.visually-hidden {
		clip: rect(0 0 0 0);
		height: 1px;
		overflow: hidden;
		position: absolute;
		white-space: nowrap;
		width: 1px;
	}
</style>
