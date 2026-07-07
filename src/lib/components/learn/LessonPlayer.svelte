<script lang="ts">
	import GrammarInterstitial from '$lib/components/learn/GrammarInterstitial.svelte';
	import LessonCompleteCelebration, {
		type CompletionStats
	} from '$lib/components/learn/LessonCompleteCelebration.svelte';
	import ProgressBar from '$lib/components/learn/ProgressBar.svelte';
	import RecallExercise from '$lib/components/learn/RecallExercise.svelte';
	import SentenceRevealCard from '$lib/components/learn/SentenceRevealCard.svelte';
	import ShortcutsHelp from '$lib/components/learn/ShortcutsHelp.svelte';
	import WordIntroCard from '$lib/components/learn/WordIntroCard.svelte';
	import { buildLessonSteps, clampStepIndex, type LearnLesson } from '$lib/learn/lesson-steps';
	import { emitLearnShortcut, shortcutActionForKey } from '$lib/learn/shortcuts';
	import { toast } from '$lib/stores/toast.svelte';

	let {
		lesson,
		progress
	}: {
		lesson: LearnLesson;
		progress: { status: string; lastStepIndex: number } | null;
	} = $props();

	const steps = $derived(buildLessonSteps(lesson));

	const resumeIndex = $derived(
		progress && progress.status !== 'COMPLETED'
			? clampStepIndex(progress.lastStepIndex, steps.length)
			: 0
	);

	let currentIndex = $state(0);
	let resumePromptOpen = $state(false);
	let recallAnswered = $state(false);
	let recallOutcome = $state<'correct' | 'incorrect' | null>(null);
	let completing = $state(false);
	let completionStats = $state<CompletionStats | null>(null);
	let completeFailed = $state(false);
	let shortcutsOpen = $state(false);

	// svelte-ignore state_referenced_locally — intentional one-time init
	if (resumeIndex > 0) {
		resumePromptOpen = true;
	}

	const step = $derived(steps[currentIndex]);
	const canGoBack = $derived(currentIndex > 0 && step?.kind !== 'complete');
	const canAdvance = $derived(
		step ? step.kind !== 'complete' && (step.kind !== 'recall' || recallAnswered) : false
	);

	let progressTimer: ReturnType<typeof setTimeout> | null = null;

	function postProgress(stepIndex: number) {
		if (progressTimer) clearTimeout(progressTimer);
		progressTimer = setTimeout(() => {
			void fetch('/api/learn/progress', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lessonId: lesson.id, stepIndex })
			}).catch(() => {});
		}, 500);
	}

	async function completeNow() {
		if (completing || completionStats) return;
		completing = true;
		completeFailed = false;
		try {
			const res = await fetch('/api/learn/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lessonId: lesson.id })
			});
			if (!res.ok) throw new Error();
			completionStats = (await res.json()) as CompletionStats;
		} catch {
			completeFailed = true;
			toast.error('Could not save your progress. Check your connection.', 4500);
		} finally {
			completing = false;
		}
	}

	function goTo(index: number) {
		currentIndex = clampStepIndex(index, steps.length);
		recallAnswered = false;
		recallOutcome = null;
		const next = steps[currentIndex];
		if (next?.kind === 'complete') {
			void completeNow();
		} else {
			postProgress(currentIndex);
		}
	}

	function advance() {
		if (!canAdvance) return;
		goTo(currentIndex + 1);
	}

	function goBack() {
		if (!canGoBack) return;
		goTo(currentIndex - 1);
	}

	function handleRecallResult(lessonWordId: string, result: import('$lib/srs').RecallResult) {
		recallAnswered = true;
		recallOutcome = result.correct && !result.revealed ? 'correct' : 'incorrect';
		// A miss marks the word's SRS card due for review (fire-and-forget);
		// clean answers never advance the schedule from inside a lesson. Any
		// wrong submission counts, even if the learner got there in the end.
		const missed = result.revealed || !result.correct || result.wrongSubmits > 0;
		void fetch('/api/learn/drill-result', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ lessonWordId, correct: !missed })
		}).catch(() => {});
	}

	function resume() {
		resumePromptOpen = false;
		goTo(resumeIndex);
	}

	function startOver() {
		resumePromptOpen = false;
		goTo(0);
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (resumePromptOpen || completionStats || shortcutsOpen) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target as HTMLElement | null;
		const typing =
			target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
		const inControl =
			typing || (target && (target.tagName === 'BUTTON' || target.tagName === 'A' || target.tagName === 'SELECT'));

		if (event.key === 'ArrowRight' || (event.key === 'Enter' && !inControl)) {
			if (canAdvance) {
				event.preventDefault();
				advance();
			}
			return;
		}
		if (event.key === 'ArrowLeft' && !inControl) {
			if (canGoBack) {
				event.preventDefault();
				goBack();
			}
			return;
		}
		if (typing) return;
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
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="player">
	<header class="player-head">
		<a class="exit" href="/learn" aria-label="Exit lesson">✕</a>
		<ProgressBar current={currentIndex} total={Math.max(1, steps.length - 1)} />
		<span class="step-count mono">{Math.min(currentIndex + 1, steps.length)}/{steps.length}</span>
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

	<ShortcutsHelp open={shortcutsOpen} context="lesson" onclose={() => (shortcutsOpen = false)} />

	{#if resumePromptOpen}
		<div class="player-card resume-card">
			<h2 class="resume-title">Welcome back</h2>
			<p class="resume-text">
				You were partway through <strong>{lesson.title}</strong>.
			</p>
			<div class="resume-actions">
				<button type="button" class="btn" onclick={resume}>
					Resume (step {resumeIndex + 1} of {steps.length})
				</button>
				<button type="button" class="btn ghost" onclick={startOver}>Start over</button>
			</div>
		</div>
	{:else if step}
		{#key currentIndex}
			<div
				class="player-card"
				class:outcome-correct={recallOutcome === 'correct'}
				class:outcome-incorrect={recallOutcome === 'incorrect'}
			>
				{#if step.kind === 'grammar'}
					<GrammarInterstitial markdown={step.markdown} title={step.title} />
				{:else if step.kind === 'section'}
					<div class="section-card">
						<div class="section-kicker">Up next</div>
						<h2 class="section-title">{step.title}</h2>
					</div>
				{:else if step.kind === 'wordIntro'}
					<WordIntroCard lessonWord={step.lessonWord} />
				{:else if step.kind === 'recall'}
					<RecallExercise
						lessonWord={step.lessonWord}
						blanks={step.blanks}
						mode={step.mode}
						onResult={(result) => handleRecallResult(step.lessonWord.id, result)}
					/>
				{:else if step.kind === 'storyIntro'}
					<div class="section-card">
						<div class="section-kicker">Story</div>
						<h2 class="section-title">{step.title}</h2>
						{#if step.description}
							<p class="section-description">{step.description}</p>
						{/if}
						{#if step.source}
							<p class="section-source">Source: {step.source}</p>
						{/if}
					</div>
				{:else if step.kind === 'storySentence'}
					<SentenceRevealCard
						sentence={step.storySentence.exampleSentence}
						speaker={step.storySentence.speaker}
						grammarNotes={step.storySentence.grammarNotes}
						showFeedbackActions
					/>
				{:else if step.kind === 'complete'}
					{#if completionStats}
						<LessonCompleteCelebration lessonTitle={lesson.title} stats={completionStats} />
					{:else if completing}
						<p class="completing">Saving your progress…</p>
					{:else if completeFailed}
						<div class="complete-retry">
							<p>Your progress couldn't be saved.</p>
							<button type="button" class="btn" onclick={completeNow}>Try again</button>
						</div>
					{/if}
				{/if}
			</div>
		{/key}

		{#if step.kind !== 'complete'}
			<footer class="player-foot">
				<button type="button" class="btn-sm ghost" onclick={goBack} disabled={!canGoBack}>
					← Back
				</button>
				<button type="button" class="btn continue" onclick={advance} disabled={!canAdvance}>
					Continue →
				</button>
			</footer>
		{/if}
	{/if}
</div>

<style>
	.player {
		display: grid;
		gap: 1.1rem;
		margin: 0 auto;
		max-width: 720px;
	}

	.player-head {
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

	.step-count {
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

	.player-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg, 10px);
		display: grid;
		min-height: 320px;
		padding: 2rem;
		transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
	}

	.player-card.outcome-correct {
		background: color-mix(in oklab, var(--brand) 7%, var(--bg-raised));
		border-color: var(--brand);
		box-shadow: 0 0 0 1px var(--brand);
	}

	.player-card.outcome-incorrect {
		background: color-mix(in oklab, oklch(0.55 0.19 25) 7%, var(--bg-raised));
		border-color: oklch(0.55 0.19 25);
		box-shadow: 0 0 0 1px oklch(0.55 0.19 25);
	}

	.resume-card {
		display: grid;
		gap: 0.7rem;
		justify-items: center;
		text-align: center;
	}

	.resume-title {
		font-family: var(--font-display, inherit);
		margin: 0.5rem 0 0;
	}

	.resume-text {
		color: var(--ink-soft);
		margin: 0;
	}

	.resume-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		justify-content: center;
		margin-top: 0.6rem;
	}

	.section-card {
		display: grid;
		gap: 0.5rem;
		justify-items: center;
		padding: 2rem 0;
		text-align: center;
	}

	.section-kicker {
		color: var(--accent);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.section-title {
		font-family: var(--font-display, inherit);
		font-size: 1.7rem;
		margin: 0;
	}

	.section-description {
		color: var(--ink-soft);
		margin: 0;
		max-width: 46ch;
	}

	.section-source {
		color: var(--ink-mute);
		font-size: 13px;
		margin: 0;
	}

	.completing {
		color: var(--ink-mute);
		text-align: center;
	}

	.complete-retry {
		display: grid;
		gap: 0.7rem;
		justify-items: center;
		text-align: center;
	}

	.player-foot {
		align-items: center;
		display: flex;
		justify-content: space-between;
	}

	.continue {
		min-width: 160px;
	}

	@media (max-width: 640px) {
		.player-card {
			min-height: 260px;
			padding: 1.25rem;
		}
	}
</style>
