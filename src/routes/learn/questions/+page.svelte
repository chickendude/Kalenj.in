<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const dateFmt = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
</script>

<svelte:head>
	<title>Your questions · Learn</title>
</svelte:head>

<div class="page-head">
	<div>
		<div class="page-kicker">Learn</div>
		<h1>Your questions</h1>
		<p>Questions you've asked about words and sentences, with answers from the editors.</p>
	</div>
</div>

{#if !data.user}
	<div class="questions-empty">
		<p>
			Questions need an account, so the editors' answers can find their way back to you.
			<a href="/signup">Create one</a> or <a href="/login">sign in</a> to ask about words and
			sentences while you learn.
		</p>
		<a class="btn ghost" href="/learn">Back to lessons</a>
	</div>
{:else if data.questions.length === 0}
	<div class="questions-empty">
		<p>
			You haven't asked anything yet. When something in a lesson doesn't make sense, use
			<em>Ask a question</em> on the word or sentence.
		</p>
		<a class="btn ghost" href="/learn">Back to lessons</a>
	</div>
{:else}
	<ol class="questions">
		{#each data.questions as q (q.id)}
			<li class="question-card" class:answered={q.status === 'ANSWERED'}>
				<div class="question-target">
					{#if q.word}
						<strong>{q.word.kalenjin}</strong>
						<span class="muted">— {q.word.translations}</span>
					{:else if q.sentence}
						<strong>{q.sentence.kalenjin}</strong>
						<span class="muted">— {q.sentence.english}</span>
					{/if}
					{#if q.lesson}
						<span class="lesson-chip">{q.lesson.title}</span>
					{/if}
				</div>
				<p class="question-text">{q.question}</p>
				{#if q.status === 'ANSWERED' && q.answer}
					<div class="answer">
						<div class="answer-label">Answer</div>
						<p class="answer-text">{q.answer}</p>
					</div>
				{:else if q.status === 'DISMISSED'}
					<p class="status-note">This question was closed without an answer.</p>
				{:else}
					<p class="status-note">Waiting for an answer…</p>
				{/if}
				<time class="question-date" datetime={q.createdAt.toISOString()}>
					Asked {dateFmt.format(q.createdAt)}
				</time>
			</li>
		{/each}
	</ol>
{/if}

<style>
	.questions-empty {
		color: var(--ink-soft);
		display: grid;
		gap: 0.9rem;
		justify-items: start;
		max-width: 52ch;
	}

	.questions {
		display: grid;
		gap: 0.9rem;
		list-style: none;
		margin: 1rem 0 0;
		max-width: 720px;
		padding: 0;
	}

	.question-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg, 10px);
		display: grid;
		gap: 0.5rem;
		padding: 1rem 1.2rem;
	}

	.question-card.answered {
		border-color: color-mix(in oklab, var(--brand) 45%, var(--line));
	}

	.question-target {
		align-items: baseline;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		font-size: 14px;
	}

	.muted {
		color: var(--ink-mute);
	}

	.lesson-chip {
		background: color-mix(in oklab, var(--line) 40%, transparent);
		border-radius: 999px;
		color: var(--ink-soft);
		font-size: 11.5px;
		padding: 0.1rem 0.55rem;
	}

	.question-text {
		color: var(--ink);
		margin: 0;
	}

	.answer {
		border-left: 3px solid var(--brand);
		display: grid;
		gap: 0.2rem;
		padding-left: 0.8rem;
	}

	.answer-label {
		color: var(--brand);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.answer-text {
		color: var(--ink-soft);
		margin: 0;
		white-space: pre-line;
	}

	.status-note {
		color: var(--ink-mute);
		font-size: 13.5px;
		font-style: italic;
		margin: 0;
	}

	.question-date {
		color: var(--ink-mute);
		font-size: 12px;
	}
</style>
