<script lang="ts">
	import { gradeCard, type SrsState } from '$lib/srs';
	import type { ReviewGrade } from '@prisma/client';

	let {
		suggested = null,
		cardState = null,
		onGrade
	}: {
		suggested?: ReviewGrade | null;
		/** When provided, each button previews its next interval. */
		cardState?: SrsState | null;
		onGrade: (grade: ReviewGrade) => void;
	} = $props();

	const GRADES: Array<{ grade: ReviewGrade; label: string; key: string }> = [
		{ grade: 'AGAIN', label: 'Again', key: '1' },
		{ grade: 'HARD', label: 'Hard', key: '2' },
		{ grade: 'GOOD', label: 'Good', key: '3' },
		{ grade: 'EASY', label: 'Easy', key: '4' }
	];

	function intervalPreview(grade: ReviewGrade): string | null {
		if (!cardState) return null;
		const next = gradeCard(cardState, grade, new Date());
		if (next.intervalDays < 1) return '10m';
		const days = Math.round(next.intervalDays);
		return days >= 30 ? `${Math.round(days / 30)}mo` : `${days}d`;
	}

	function handleKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
		const byKey = GRADES.find((entry) => entry.key === event.key);
		if (byKey) {
			event.preventDefault();
			onGrade(byKey.grade);
		} else if (event.key === 'Enter' && suggested) {
			event.preventDefault();
			onGrade(suggested);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="grade-buttons" role="group" aria-label="How well did you know it?">
	{#each GRADES as entry (entry.grade)}
		<button
			type="button"
			class="grade-btn {entry.grade.toLowerCase()}"
			class:suggested={suggested === entry.grade}
			onclick={() => onGrade(entry.grade)}
		>
			<span class="grade-label">{entry.label}</span>
			{#if intervalPreview(entry.grade)}
				<span class="grade-interval">{intervalPreview(entry.grade)}</span>
			{/if}
			<span class="grade-key mono" aria-hidden="true">{entry.key}</span>
		</button>
	{/each}
</div>

<style>
	.grade-buttons {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(4, 1fr);
		width: 100%;
	}

	.grade-btn {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius, 6px);
		cursor: pointer;
		display: grid;
		gap: 0.1rem;
		justify-items: center;
		padding: 0.55rem 0.4rem;
		position: relative;
		transition: border-color 0.15s, background 0.15s;
	}

	.grade-btn:hover {
		border-color: var(--brand);
	}

	.grade-btn.suggested {
		border-color: var(--brand);
		box-shadow: 0 0 0 1px var(--brand);
	}

	.grade-label {
		color: var(--ink);
		font-size: 14px;
		font-weight: 600;
	}

	.grade-btn.again .grade-label {
		color: oklch(0.55 0.19 25);
	}

	.grade-btn.easy .grade-label {
		color: var(--brand);
	}

	.grade-interval {
		color: var(--ink-mute);
		font-size: 11.5px;
	}

	.grade-key {
		color: var(--ink-mute);
		font-size: 10px;
		opacity: 0.7;
		position: absolute;
		right: 6px;
		top: 4px;
	}

	@media (max-width: 480px) {
		.grade-buttons {
			grid-template-columns: repeat(2, 1fr);
		}

		.grade-key {
			display: none;
		}
	}
</style>
