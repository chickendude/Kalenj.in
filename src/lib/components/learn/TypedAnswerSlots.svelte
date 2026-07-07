<script lang="ts">
	import { isTypeableChar, normalizeAnswerChar } from '$lib/learn/lesson-steps';

	/**
	 * Per-character slot renderer for typed recall. The target may contain
	 * spaces (multi-word answers) and punctuation; the learner only types
	 * letters/digits — punctuation is shown for them ('given' slots).
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
		label = null
	}: {
		target: string;
		typed: string;
		done?: boolean;
		graded?: boolean;
		active?: boolean;
		label?: string | null;
	} = $props();

	type Slot = {
		char: string;
		state: 'pending' | 'ok' | 'bad' | 'given' | 'filled';
		caret: boolean;
	};

	const words = $derived.by(() => {
		const groups: Slot[][] = [];
		let typedIndex = 0;
		for (const targetWord of target.split(' ')) {
			const slots: Slot[] = [];
			for (const char of targetWord) {
				if (!isTypeableChar(char)) {
					slots.push({ char, state: 'given', caret: false });
					continue;
				}
				const typedChar = typed[typedIndex];
				if (typedChar === undefined) {
					slots.push({ char, state: 'pending', caret: active && typedIndex === typed.length });
				} else {
					slots.push({
						char: typedChar,
						state: graded
							? normalizeAnswerChar(typedChar) === normalizeAnswerChar(char)
								? 'ok'
								: 'bad'
							: 'filled',
						caret: false
					});
					typedIndex += 1;
				}
			}
			groups.push(slots);
		}
		return groups;
	});
</script>

<span class="answer-slots-wrap">
	<span class="answer-slots" class:done>
		{#each words as slots, wordIndex (wordIndex)}
			<span class="slot-word">
				{#each slots as slot, slotIndex (slotIndex)}
					<span class="slot {slot.state}" class:caret={slot.caret}
						>{slot.state === 'pending' ? ' ' : slot.char}</span
					>
				{/each}
			</span>
		{/each}
	</span>
	{#if label}
		<span class="slots-label">{label}</span>
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
		letter-spacing: normal;
		line-height: 1.3;
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
