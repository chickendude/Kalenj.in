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
		onResult
	}: {
		lessonWord: LearnLessonWord;
		blanks: BlankResolution;
		mode?: RecallMode;
		onResult: (result: RecallResult) => void;
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
	/** Characters the learner actually types: letters/digits only — punctuation is shown for them. */
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
	// Once answered, the sentence renders with hover pop-up definitions instead.
	const slotsLabel = $derived(!done && !isAudioMode ? prompt : null);

	// Text drills show the full sentence translation up front; dictation keeps
	// it hidden so the challenge stays on the listening.
	const showTranslation = $derived(done || translationShown || (!isAudioMode && Boolean(sentence)));

	const kicker = $derived(
		blanks.kind !== 'sentence'
			? 'Type the word'
			: isAudioMode
				? 'Listen — fill in what you hear'
				: 'Fill in the blank'
	);

	function handleInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		typed = [...input.value]
			.filter(isTypeableChar)
			.join('')
			.slice(0, typeableTarget.length);
		input.value = typed;
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
		const normalizedTyped = [...typed].map(normalizeAnswerChar).join('');
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
		// Fix the earliest wrong char, or reveal the next one.
		let fixIndex = typed.length;
		for (let i = 0; i < typed.length; i += 1) {
			if (normalizeAnswerChar(typed[i]) !== normalizeAnswerChar(typeableTarget[i] ?? '')) {
				fixIndex = i;
				break;
			}
		}
		typed = typeableTarget.slice(0, fixIndex + 1);
		gradedAttempt = null;
		if (typed.length >= typeableTarget.length) {
			finish(false);
			return;
		}
		inputEl?.focus();
	}

	function reveal() {
		if (done) return;
		typed = typeableTarget;
		finish(true);
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
			<span class="listen-hint">Listen, then fill in the missing {target.includes(' ') ? 'words' : 'word'}</span>
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
							active={focused && !done}
							label={slotsLabel}
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
				active={focused && !done}
				label={slotsLabel}
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
			<Tooltip label="Reveal the next letter">
				<button type="button" class="btn-sm ghost" onclick={hint} aria-label="Hint">💡 Hint</button>
			</Tooltip>
			{#if sentence && isAudioMode}
				<Tooltip
					label={translationShown ? 'Hide the sentence translation' : 'Show the sentence translation'}
				>
					<button
						type="button"
						class="btn-sm ghost"
						onclick={() => (translationShown = !translationShown)}
						aria-label={translationShown
							? 'Hide sentence translation'
							: 'Show sentence translation'}
					>
						🌐 {translationShown ? 'Hide translation' : 'Translate'}
					</button>
				</Tooltip>
			{/if}
			{#if sentence?.audioUrl && !isAudioMode}
				<AudioPlayButton
					bind:this={audioButton}
					audioUrl={sentence.audioUrl}
					size="sm"
					label="Play sentence audio"
				/>
			{/if}
			<span class="spacer"></span>
			<button type="button" class="btn-sm ghost give-up" onclick={reveal}>Show answer</button>
			<button type="button" class="btn-sm" onclick={submit} disabled={typed.length === 0}>
				Check
			</button>
		{:else}
			<div class="result" class:success={correct} role="status">
				{#if correct}
					{wrongSubmits > 0 || usedHint ? 'Correct — keep practising this one.' : 'Correct!'}
				{:else}
					The answer was <strong>{target}</strong>
				{/if}
			</div>
			{#if sentence?.audioUrl}
				<AudioPlayButton
					bind:this={audioButton}
					audioUrl={sentence.audioUrl}
					size="sm"
					label="Play sentence audio"
					autoplay
				/>
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

	.listen-hint {
		color: var(--ink-mute);
		font-size: 13.5px;
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

	.give-up {
		color: var(--ink-mute);
	}

	.result {
		color: var(--ink-soft);
		font-size: 0.98rem;
	}

	.result.success {
		color: var(--brand);
		font-weight: 600;
	}
</style>
