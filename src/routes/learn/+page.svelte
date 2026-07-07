<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const LEVEL_LABELS: Record<string, string> = {
		A1: 'A1 · Beginner',
		A2: 'A2 · Elementary',
		B1: 'B1 · Intermediate',
		B2: 'B2 · Upper intermediate',
		C1: 'C1 · Advanced'
	};

	function typeLabel(lesson: { type: string; vocabularyType: string | null }): string {
		if (lesson.type === 'STORY') return 'Story';
		if (lesson.vocabularyType === 'GRAMMAR') return 'Grammar';
		if (lesson.vocabularyType === 'EXPRESSION') return 'Expressions';
		return 'Vocabulary';
	}
</script>

<svelte:head>
	<title>Learn · Kalenjin</title>
</svelte:head>

<div class="page-head">
	<div>
		<div class="page-kicker">Learn</div>
		<h1>Your learning journey</h1>
		<p>Work through the lessons one by one — every few lessons a story puts your new words to use.</p>
	</div>
	<div class="head-stats">
		<div class="page-stat">
			<b>{data.streak} 🔥</b>
			day streak
		</div>
		<div class="page-stat">
			<b>{data.totalXp}</b>
			total XP
		</div>
	</div>
</div>

<div class="learn-ctas">
	<a class="cta-card" class:has-due={data.dueCount > 0} href="/learn/review">
		<span class="cta-title">Review words</span>
		<span class="cta-detail">
			{data.dueCount > 0 ? `${data.dueCount} due now` : 'Nothing due — nice work'}
		</span>
	</a>
	<a class="cta-card" href="/learn/listen">
		<span class="cta-title">Listening practice</span>
		<span class="cta-detail">
			{data.missedCount > 0 ? `${data.missedCount} tricky sentences` : 'Hear it, say it, repeat'}
		</span>
	</a>
	{#if data.questionCount > 0}
		<a class="cta-card" href="/learn/questions">
			<span class="cta-title">Your questions</span>
			<span class="cta-detail">
				{data.answeredQuestionCount > 0
					? `${data.answeredQuestionCount} answered`
					: 'Waiting for answers'}
			</span>
		</a>
	{/if}
</div>

{#if data.levels.length === 0}
	<p class="journey-empty">No lessons published yet — check back soon.</p>
{:else}
	{#each data.levels as group (group.level)}
		<section class="level-group">
			<h2 class="level-title">{LEVEL_LABELS[group.level] ?? group.level}</h2>
			<ol class="journey">
				{#each group.lessons as lesson (lesson.id)}
					<li class="journey-item {lesson.state}" class:story={lesson.type === 'STORY'}>
						{#if lesson.state === 'locked'}
							<div class="lesson-node" aria-label="{lesson.title} (locked)">
								<span class="node-marker" aria-hidden="true">
									{lesson.type === 'STORY' ? '📖' : '🔒'}
								</span>
								<span class="node-body">
									<span class="node-title">{lesson.title}</span>
									<span class="node-meta">{typeLabel(lesson)}</span>
								</span>
							</div>
						{:else}
							<a class="lesson-node" href="/learn/{lesson.slug}">
								<span class="node-marker" aria-hidden="true">
									{#if lesson.type === 'STORY'}📖{:else if lesson.state === 'completed'}✓{:else}★{/if}
								</span>
								<span class="node-body">
									<span class="node-title">{lesson.title}</span>
									<span class="node-meta">
										{typeLabel(lesson)}
										{#if lesson.wordCount > 0}
											· {lesson.wordCount} {lesson.wordCount === 1 ? 'word' : 'words'}
										{/if}
										{#if lesson.state === 'in_progress'}
											· In progress
										{:else if lesson.state === 'available'}
											· Up next
										{/if}
									</span>
								</span>
							</a>
						{/if}
					</li>
				{/each}
			</ol>
		</section>
	{/each}
{/if}

<style>
	.head-stats {
		display: flex;
		gap: 1.5rem;
	}

	.learn-ctas {
		display: grid;
		gap: 0.9rem;
		grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
		margin: 1.4rem 0 2rem;
	}

	.cta-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg, 10px);
		display: grid;
		gap: 0.2rem;
		padding: 1rem 1.2rem;
		text-decoration: none;
		transition: border-color 0.15s, transform 0.15s;
	}

	.cta-card:hover {
		border-color: var(--brand);
		transform: translateY(-1px);
	}

	.cta-card.has-due {
		border-color: var(--accent);
	}

	.cta-title {
		color: var(--ink);
		font-weight: 600;
	}

	.cta-detail {
		color: var(--ink-mute);
		font-size: 13px;
	}

	.cta-card.has-due .cta-detail {
		color: var(--accent);
		font-weight: 600;
	}

	.journey-empty {
		color: var(--ink-mute);
	}

	.level-group {
		margin-bottom: 2rem;
	}

	.level-title {
		border-bottom: 1px solid var(--line);
		font-family: var(--font-display, inherit);
		font-size: 1.15rem;
		margin: 0 0 0.9rem;
		padding-bottom: 0.45rem;
	}

	.journey {
		display: grid;
		gap: 0.55rem;
		list-style: none;
		margin: 0;
		padding: 0;
		position: relative;
	}

	.journey::before {
		background: var(--line);
		bottom: 22px;
		content: '';
		left: 21px;
		position: absolute;
		top: 22px;
		width: 2px;
	}

	.journey-item {
		position: relative;
	}

	.lesson-node {
		align-items: center;
		display: flex;
		gap: 0.9rem;
		padding: 0.25rem 0;
		text-decoration: none;
	}

	.node-marker {
		align-items: center;
		background: var(--bg-raised);
		border: 2px solid var(--line);
		border-radius: 50%;
		display: inline-flex;
		flex-shrink: 0;
		font-size: 16px;
		height: 44px;
		justify-content: center;
		position: relative;
		width: 44px;
		z-index: 1;
	}

	.journey-item.completed .node-marker {
		background: var(--brand);
		border-color: var(--brand);
		color: var(--on-brand, #fff);
		font-weight: 700;
	}

	.journey-item.available .node-marker,
	.journey-item.in_progress .node-marker {
		border-color: var(--accent);
		color: var(--accent);
	}

	.journey-item.locked .node-marker {
		filter: grayscale(1);
		opacity: 0.6;
	}

	/* Story lessons are milestones — bigger node, accent ring, book icon. */
	.journey-item.story .node-marker {
		background: color-mix(in oklab, var(--accent) 14%, var(--bg-raised));
		border-color: var(--accent);
		border-width: 3px;
		font-size: 22px;
		height: 54px;
		margin-left: -5px;
		width: 54px;
	}

	.journey-item.story.completed .node-marker {
		background: var(--brand);
		border-color: var(--brand);
	}

	.journey-item.story .node-title {
		font-size: 1.08rem;
	}

	.journey-item.story .node-meta {
		color: var(--accent);
		font-weight: 600;
	}

	.journey-item.story.locked .node-meta {
		color: var(--ink-mute);
		font-weight: 400;
	}

	.node-body {
		display: grid;
		gap: 0.1rem;
	}

	.node-title {
		color: var(--ink);
		font-weight: 600;
	}

	.journey-item.locked .node-title {
		color: var(--ink-mute);
	}

	.node-meta {
		color: var(--ink-mute);
		font-size: 12.5px;
	}

	.journey-item.available .node-meta,
	.journey-item.in_progress .node-meta {
		color: var(--accent);
	}

	a.lesson-node:hover .node-title {
		text-decoration: underline;
	}
</style>
