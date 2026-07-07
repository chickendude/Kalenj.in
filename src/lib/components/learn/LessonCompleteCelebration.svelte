<script lang="ts">
	export type CompletionStats = {
		newCards: number;
		xp: number;
		streak: number;
		totalXp: number;
		nextLessonId: string | null;
	};

	let {
		lessonTitle,
		stats
	}: {
		lessonTitle: string;
		stats: CompletionStats;
	} = $props();

	const confetti = Array.from({ length: 24 }, (_, i) => ({
		left: (i * 41) % 100,
		delay: (i % 8) * 0.18,
		duration: 2.4 + (i % 5) * 0.35,
		hue: (i * 47) % 360
	}));
</script>

<div class="celebration">
	<div class="confetti" aria-hidden="true">
		{#each confetti as piece, i (i)}
			<span
				class="confetti-piece"
				style="left: {piece.left}%; animation-delay: {piece.delay}s; animation-duration: {piece.duration}s; background: oklch(0.7 0.17 {piece.hue});"
			></span>
		{/each}
	</div>

	<div class="badge" aria-hidden="true">✓</div>
	<h2 class="celebration-title">Lesson complete!</h2>
	<p class="celebration-subtitle">{lessonTitle}</p>

	<div class="stats">
		{#if stats.xp > 0}
			<div class="stat"><b>+{stats.xp}</b><span>XP</span></div>
		{/if}
		{#if stats.newCards > 0}
			<div class="stat"><b>{stats.newCards}</b><span>new {stats.newCards === 1 ? 'word' : 'words'} to review</span></div>
		{/if}
		<div class="stat"><b>{stats.streak}</b><span>day streak 🔥</span></div>
	</div>

	<div class="celebration-actions">
		{#if stats.nextLessonId}
			<a class="btn" href="/learn/{stats.nextLessonId}">Next lesson</a>
		{/if}
		<a class="btn ghost" href="/learn">Back to lessons</a>
	</div>
</div>

<style>
	.celebration {
		display: grid;
		gap: 0.8rem;
		justify-items: center;
		padding: 1.5rem 0;
		position: relative;
		text-align: center;
	}

	.confetti {
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		position: absolute;
	}

	.confetti-piece {
		animation: confetti-fall linear infinite;
		border-radius: 2px;
		height: 12px;
		position: absolute;
		top: -14px;
		width: 8px;
	}

	@keyframes confetti-fall {
		0% {
			opacity: 1;
			transform: translateY(0) rotate(0deg);
		}
		100% {
			opacity: 0.1;
			transform: translateY(340px) rotate(540deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.confetti-piece {
			animation: none;
			display: none;
		}
	}

	.badge {
		align-items: center;
		background: var(--brand);
		border-radius: 50%;
		color: var(--on-brand, #fff);
		display: flex;
		font-size: 2rem;
		font-weight: 700;
		height: 72px;
		justify-content: center;
		width: 72px;
	}

	.celebration-title {
		font-family: var(--font-display, inherit);
		font-size: 1.8rem;
		margin: 0;
	}

	.celebration-subtitle {
		color: var(--ink-soft);
		margin: 0;
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
		justify-content: center;
		margin: 0.6rem 0;
	}

	.stat {
		display: grid;
		gap: 0.1rem;
		justify-items: center;
	}

	.stat b {
		color: var(--brand);
		font-size: 1.5rem;
	}

	.stat span {
		color: var(--ink-mute);
		font-size: 13px;
	}

	.celebration-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		justify-content: center;
	}
</style>
