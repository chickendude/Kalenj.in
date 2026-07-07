<script lang="ts">
	import FlashCard from '$lib/components/learn/FlashCard.svelte';
	import GradeButtons from '$lib/components/learn/GradeButtons.svelte';
	import ProgressBar from '$lib/components/learn/ProgressBar.svelte';
	import RecallExercise from '$lib/components/learn/RecallExercise.svelte';
	import ShortcutsHelp from '$lib/components/learn/ShortcutsHelp.svelte';
	import { emitLearnShortcut, shortcutActionForKey } from '$lib/learn/shortcuts';
	import { resolveBlanks, type LearnLessonWord } from '$lib/learn/lesson-steps';
	import { gradeCard, suggestedGradeFromRecall, type RecallResult } from '$lib/srs';
	import { toast } from '$lib/stores/toast.svelte';
	import type { ReviewGrade } from '@prisma/client';

	export type ReviewCard = {
		id: string;
		ease: number;
		intervalDays: number;
		reps: number;
		lapses: number;
		word: {
			kalenjin: string;
			translations: string;
			audioUrl: string | null;
		} | null;
		standaloneLessonWord: LearnLessonWord | null;
		contextLessonWord: LearnLessonWord | null;
	};

	let { cards }: { cards: ReviewCard[] } = $props();

	// svelte-ignore state_referenced_locally — session queue seeded once from the load
	let queue = $state<ReviewCard[]>([...cards]);
	// svelte-ignore state_referenced_locally — initial session size, intentionally frozen
	const totalPlanned = cards.length;
	let reviewedCount = $state(0);
	let suggested = $state<ReviewGrade | null>(null);
	let answered = $state(false);
	let outcome = $state<'correct' | 'incorrect' | null>(null);
	let posting = $state(false);
	/** Bumps to remount the exercise when the same card comes back via AGAIN. */
	let attempt = $state(0);
	let shortcutsOpen = $state(false);

	function handleWindowKeydown(event: KeyboardEvent) {
		if (shortcutsOpen || event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target as HTMLElement | null;
		if (
			target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
		) {
			return;
		}
		if (event.key === '?') {
			event.preventDefault();
			shortcutsOpen = true;
			return;
		}
		const action = shortcutActionForKey(event.key);
		if (action) {
			event.preventDefault();
			emitLearnShortcut(action);
		}
	}

	const card = $derived(queue[0] ?? null);
	const exerciseLessonWord = $derived(
		card ? (card.contextLessonWord ?? card.standaloneLessonWord) : null
	);
	const recallBlanks = $derived(
		exerciseLessonWord?.sentence
			? resolveBlanks(exerciseLessonWord, exerciseLessonWord.sentence.tokens)
			: null
	);
	const flashFront = $derived(
		card ? (card.word?.translations ?? exerciseLessonWord?.translations ?? '') : ''
	);
	const flashBack = $derived(
		card ? (card.word?.kalenjin ?? exerciseLessonWord?.kalenjin ?? '') : ''
	);

	function handleRecallResult(result: RecallResult) {
		suggested = suggestedGradeFromRecall(result);
		answered = true;
		outcome = result.correct && !result.revealed ? 'correct' : 'incorrect';
	}

	function handleFlashRevealed() {
		suggested = 'GOOD';
		answered = true;
	}

	async function grade(gradeValue: ReviewGrade) {
		if (!card || !answered || posting) return;
		posting = true;
		try {
			const res = await fetch('/api/learn/reviews', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cardId: card.id, grade: gradeValue })
			});
			if (!res.ok) throw new Error();

			reviewedCount += 1;
			const rest = queue.slice(1);
			if (gradeValue === 'AGAIN') {
				// Mirror the server's scheduling locally and re-queue the card a few
				// places back so it comes around again this session.
				const next = gradeCard(card, gradeValue, new Date());
				const requeued = { ...card, ...next };
				const insertAt = Math.min(3, rest.length);
				queue = [...rest.slice(0, insertAt), requeued, ...rest.slice(insertAt)];
			} else {
				queue = rest;
			}
			answered = false;
			suggested = null;
			outcome = null;
			attempt += 1;
		} catch {
			toast.error('Could not save that review. Check your connection.', 4500);
		} finally {
			posting = false;
		}
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<ShortcutsHelp open={shortcutsOpen} context="review" onclose={() => (shortcutsOpen = false)} />

<div class="review">
	{#if card}
		<header class="review-head">
			<a class="exit" href="/learn" aria-label="Exit review">✕</a>
			<ProgressBar current={reviewedCount} total={Math.max(1, reviewedCount + queue.length)} />
			<span class="remaining mono">{queue.length} left</span>
			<button
				type="button"
				class="shortcuts-btn"
				aria-label="Keyboard shortcuts"
				onclick={() => (shortcutsOpen = true)}
			>
				<svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
					<rect x="1.5" y="4.5" width="17" height="11" rx="2" stroke="currentColor" stroke-width="1.4" />
					<path
						d="M4.5 8h1M8 8h1M11.5 8h1M15 8h1M4.5 11h1M8 11h1M11.5 11h1M15 11h1M6.5 13.5h7"
						stroke="currentColor"
						stroke-width="1.3"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</header>

		{#key `${card.id}:${attempt}`}
			<div
				class="review-card"
				class:outcome-correct={outcome === 'correct'}
				class:outcome-incorrect={outcome === 'incorrect'}
			>
				{#if exerciseLessonWord && recallBlanks}
					<RecallExercise
						lessonWord={exerciseLessonWord}
						blanks={recallBlanks}
						onResult={handleRecallResult}
					/>
				{:else}
					<FlashCard
						front={flashFront}
						back={flashBack}
						audioUrl={card.word?.audioUrl}
						onRevealed={handleFlashRevealed}
					/>
				{/if}
			</div>
		{/key}

		<footer class="review-foot" class:visible={answered}>
			{#if answered}
				<GradeButtons {suggested} cardState={card} onGrade={grade} />
			{/if}
		</footer>
	{:else}
		<div class="review-card summary">
			<div class="summary-emoji" aria-hidden="true">🎉</div>
			<h2 class="summary-title">
				{totalPlanned === 0 ? 'Nothing to review' : 'Reviews done!'}
			</h2>
			<p class="summary-text">
				{#if totalPlanned === 0}
					You're all caught up. Complete more lessons to add new words.
				{:else}
					You worked through {reviewedCount} {reviewedCount === 1 ? 'review' : 'reviews'}. Come
					back tomorrow to keep your words fresh.
				{/if}
			</p>
			<a class="btn" href="/learn">Back to lessons</a>
		</div>
	{/if}
</div>

<style>
	.review {
		display: grid;
		gap: 1.1rem;
		margin: 0 auto;
		max-width: 720px;
	}

	.review-head {
		align-items: center;
		display: flex;
		gap: 0.9rem;
	}

	.exit {
		align-items: center;
		border: 1px solid var(--line);
		border-radius: 50%;
		color: var(--ink-mute);
		display: inline-flex;
		flex-shrink: 0;
		font-size: 14px;
		height: 34px;
		justify-content: center;
		text-decoration: none;
		width: 34px;
	}

	.exit:hover {
		background: var(--surface, var(--bg-raised));
		color: var(--ink);
	}

	.remaining {
		color: var(--ink-mute);
		flex-shrink: 0;
		font-size: 12px;
	}

	.shortcuts-btn {
		align-items: center;
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 50%;
		color: var(--ink-mute);
		cursor: pointer;
		display: inline-flex;
		flex-shrink: 0;
		height: 34px;
		justify-content: center;
		width: 34px;
	}

	.shortcuts-btn:hover {
		background: var(--surface, var(--bg-raised));
		color: var(--ink);
	}

	.review-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg, 10px);
		display: grid;
		min-height: 280px;
		padding: 2rem;
		transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
	}

	.review-card.outcome-correct {
		background: color-mix(in oklab, var(--brand) 7%, var(--bg-raised));
		border-color: var(--brand);
		box-shadow: 0 0 0 1px var(--brand);
	}

	.review-card.outcome-incorrect {
		background: color-mix(in oklab, oklch(0.55 0.19 25) 7%, var(--bg-raised));
		border-color: oklch(0.55 0.19 25);
		box-shadow: 0 0 0 1px oklch(0.55 0.19 25);
	}

	.review-foot {
		min-height: 70px;
	}

	.summary {
		display: grid;
		gap: 0.7rem;
		justify-items: center;
		text-align: center;
	}

	.summary-emoji {
		font-size: 2.5rem;
	}

	.summary-title {
		font-family: var(--font-display, inherit);
		margin: 0;
	}

	.summary-text {
		color: var(--ink-soft);
		margin: 0;
		max-width: 42ch;
	}

	@media (max-width: 640px) {
		.review-card {
			min-height: 230px;
			padding: 1.25rem;
		}
	}
</style>
