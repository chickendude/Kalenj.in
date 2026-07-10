<script lang="ts">
	import { isTypeableChar, normalizeAnswerChar } from '$lib/learn/lesson-steps';

	/**
	 * Per-character slot renderer for typed recall. The target may contain
	 * spaces (multi-word answers) and punctuation; the learner types letters,
	 * digits, and apostrophes — other punctuation is shown for them ('given'
	 * slots). Slots past the typed prefix but inside `hintedUpTo` show the
	 * target letter as a muted ghost the learner types over.
	 *
	 * Colors only appear once `graded` (a submitted attempt or the finished
	 * state); while typing, filled slots stay neutral. A caret marks the next
	 * empty slot while `active`.
	 */
	let {
		target,
		typed,
		done = false,
		graded = false,
		active = false,
		hintedUpTo = 0,
		caretIndex = null,
		label = null,
		subLabel = null,
		onSlotClick = null
	}: {
		target: string;
		typed: string;
		done?: boolean;
		graded?: boolean;
		active?: boolean;
		/** Ghost-reveal target letters up to this typeable-character index. */
		hintedUpTo?: number;
		/** Caret position in typeable characters; null → after the typed prefix. */
		caretIndex?: number | null;
		label?: string | null;
		/** Dimmed second line (dictionary entry under a contextual translation). */
		subLabel?: string | null;
		/** Clicking a slot asks the parent to move the caret there. */
		onSlotClick?: ((index: number) => void) | null;
	} = $props();

	type Slot = {
		char: string;
		state: 'pending' | 'hinted' | 'ok' | 'bad' | 'given' | 'filled';
		caret: boolean;
		/** Typeable-character index (for given punctuation: the next one). */
		index: number;
	};

	function handleSlotClick(event: MouseEvent, index: number) {
		if (!onSlotClick) return;
		// Clicking the right half of a letter puts the caret after it.
		const slotEl = event.currentTarget as HTMLElement;
		const after = event.offsetX > slotEl.offsetWidth / 2 ? 1 : 0;
		onSlotClick(index + after);
	}

	let labelAnchor = $state<HTMLSpanElement | null>(null);
	let labelTextEl = $state<HTMLSpanElement | null>(null);
	let labelShift = $state(0);
	let labelMaxWidth = $state<number | null>(null);

	/**
	 * The label is centered under the blank (a zero-width anchor at the
	 * blank's midpoint, text pulled back by 50%). When the centered text
	 * would poke past the card's padding box, nudge it back inside — and cap
	 * its width to the card, so extreme hints ellipsize instead of clipping.
	 */
	function positionLabel() {
		const anchor = labelAnchor;
		const text = labelTextEl;
		if (!anchor || !text) return;
		const card = anchor.closest('.player-card, .review-card');
		let min = 8;
		let max = window.innerWidth - 8;
		if (card) {
			const rect = card.getBoundingClientRect();
			const style = getComputedStyle(card);
			min = rect.left + Number.parseFloat(style.paddingLeft);
			max = rect.right - Number.parseFloat(style.paddingRight);
		}
		const available = Math.max(0, max - min);
		const width = Math.min(text.scrollWidth, available);
		labelMaxWidth = available;
		const desiredLeft = anchor.getBoundingClientRect().left - width / 2;
		if (desiredLeft < min) labelShift = min - desiredLeft;
		else if (desiredLeft + width > max) labelShift = max - (desiredLeft + width);
		else labelShift = 0;
	}

	$effect(() => {
		void label;
		void subLabel;
		positionLabel();
		// Font metrics can settle after first paint; measure again then.
		document.fonts?.ready.then(positionLabel).catch(() => {});
		window.addEventListener('resize', positionLabel);
		return () => window.removeEventListener('resize', positionLabel);
	});

	const words = $derived.by(() => {
		const groups: Slot[][] = [];
		// Position within the typeable characters of the whole target.
		let typeableIndex = 0;
		const caretAt = Math.min(caretIndex ?? typed.length, typed.length);
		for (const targetWord of target.split(' ')) {
			const slots: Slot[] = [];
			for (const char of targetWord) {
				if (!isTypeableChar(char)) {
					slots.push({ char, state: 'given', caret: false, index: typeableIndex });
					continue;
				}
				const caret = active && typeableIndex === caretAt;
				const typedChar = typed[typeableIndex];
				if (typedChar === undefined) {
					slots.push({
						char,
						state: typeableIndex < hintedUpTo ? 'hinted' : 'pending',
						caret,
						index: typeableIndex
					});
				} else {
					slots.push({
						char: typedChar,
						state: graded
							? normalizeAnswerChar(typedChar) === normalizeAnswerChar(char)
								? 'ok'
								: 'bad'
							: 'filled',
						caret,
						index: typeableIndex
					});
				}
				typeableIndex += 1;
			}
			groups.push(slots);
		}
		return groups;
	});
</script>

<span class="answer-slots-wrap">
	<span class="answer-slots" class:done class:interactive={Boolean(onSlotClick)}>
		{#each words as slots, wordIndex (wordIndex)}
			<span class="slot-word">
				{#each slots as slot, slotIndex (slotIndex)}
					<!-- Pending slots hold a non-breaking space: a plain space would
					     collapse, leaving the box without a text baseline, and the
					     whole line would shift once the first real glyph lands.
					     Keyboard users move the caret with the arrow keys. -->
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<span
						class="slot {slot.state}"
						class:caret={slot.caret}
						onclick={onSlotClick ? (event) => handleSlotClick(event, slot.index) : undefined}
						>{slot.state === 'pending' ? '\u00a0' : slot.char}</span
					>
				{/each}
			</span>
		{/each}
	</span>
	{#if label}
		<span class="slots-label" bind:this={labelAnchor}>
			<span
				class="slots-label-text"
				bind:this={labelTextEl}
				style:transform={`translateX(calc(-50% + ${labelShift}px))`}
				style:max-width={labelMaxWidth === null ? undefined : `${labelMaxWidth}px`}
			>
				<span class="label-line">{label}</span>
				{#if subLabel}
					<span class="label-line sub-label">{subLabel}</span>
				{/if}
			</span>
		</span>
	{/if}
</span>

<style>
	.answer-slots-wrap {
		display: inline-grid;
		gap: 0.15em;
		justify-items: start;
		vertical-align: baseline;
	}

	.answer-slots {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0 0.5em;
	}

	.answer-slots.interactive:not(.done) {
		cursor: text;
	}

	.slot-word {
		border-bottom: 2px solid var(--brand);
		display: inline-flex;
		padding-bottom: 0.05em;
	}

	.slot {
		display: inline-block;
		font-family: var(--font-mono, monospace);
		min-width: 0.62em;
		position: relative;
		text-align: center;
	}

	.slot.filled {
		color: var(--ink);
	}

	/* Hint-revealed ghost letters — clearly lighter than typed text, so the
	   learner sees they're typing over a suggestion, not past their input. */
	.slot.hinted {
		color: var(--ink-mute);
		opacity: 0.75;
	}

	.slot.ok {
		color: var(--brand);
	}

	.slot.bad {
		color: oklch(0.55 0.19 25);
	}

	.slot.given {
		color: var(--ink-mute);
	}

	.slot.caret::before {
		animation: slot-caret-blink 1.1s step-end infinite;
		background: var(--accent);
		bottom: 0.05em;
		content: '';
		left: 0.06em;
		position: absolute;
		top: 0.12em;
		width: 2px;
	}

	@keyframes slot-caret-blink {
		50% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.slot.caret::before {
			animation: none;
		}
	}

	.slots-label {
		color: var(--brand);
		font-family: var(--font-body, inherit);
		font-size: 0.8rem;
		font-weight: 600;
		/* A zero-width anchor at the blank's midpoint: the hint never widens
		   the blank or pushes the following words aside — the text hangs
		   centered under it (nudged back inside the card by positionLabel).
		   The row still reserves its height, so nothing below overlaps. */
		justify-self: center;
		letter-spacing: normal;
		line-height: 1.3;
		white-space: nowrap;
		width: 0;
	}

	.slots-label-text {
		display: inline-grid;
		justify-items: center;
		/* Explicit width — inside the zero-width parent, shrink-to-fit would
		   collapse this box to nothing. The cap keeps extreme hints on screen
		   before positionLabel refines it to the card width. */
		width: max-content;
		max-width: min(75vw, 36rem);
		transform: translateX(-50%);
	}

	.label-line {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Dictionary entry under the contextual translation — barely there until
	   the learner hovers or presses it. */
	.sub-label {
		color: var(--ink-mute);
		font-weight: 500;
		opacity: 0.35;
		transition: opacity 0.15s;
	}

	.slots-label-text:hover .sub-label,
	.slots-label-text:active .sub-label {
		opacity: 1;
	}

	.answer-slots.done .slot-word {
		border-bottom-color: transparent;
	}

	.answer-slots.done .slot.ok {
		color: var(--brand);
		font-weight: 600;
	}

	.answer-slots.done .slot.given {
		color: var(--brand);
	}
</style>
