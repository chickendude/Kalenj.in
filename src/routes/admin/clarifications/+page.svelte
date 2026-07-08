<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from '$lib/stores/toast.svelte';
	import { dictionaryEntryHref } from '$lib/word-url';
	import type { ActionData, PageData, SubmitFunction } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let answeringId = $state<string | null>(null);

	const dateFmt = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	const FILTERS = [
		{ key: 'open', label: 'Open' },
		{ key: 'answered', label: 'Answered' },
		{ key: 'dismissed', label: 'Dismissed' },
		{ key: 'all', label: 'All' }
	] as const;

	const submitHandler: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				const message = (result.data as { success?: string } | undefined)?.success;
				if (message) toast.success(message);
				answeringId = null;
				await update({ invalidateAll: true });
			} else if (result.type === 'failure') {
				const message = (result.data as { error?: string } | undefined)?.error;
				toast.error(message ?? 'Something went wrong.', 4000);
			}
		};
	};
</script>

<svelte:head>
	<title>Learner questions · Admin</title>
</svelte:head>

<div class="page-head">
	<div>
		<div class="page-kicker">Admin</div>
		<h1>Learner questions</h1>
		<p>Clarification requests from lessons — answers go straight back to the learner.</p>
	</div>
</div>

<nav class="filter-row" aria-label="Filter by status">
	{#each FILTERS as filter (filter.key)}
		<a
			class="filter-chip"
			class:active={data.statusFilter === filter.key}
			href="/admin/clarifications?status={filter.key}"
		>
			{filter.label}
			<span class="filter-count">{data.statusCounts[filter.key]}</span>
		</a>
	{/each}
</nav>

{#if form?.error}
	<p class="form-feedback error">{form.error}</p>
{/if}

{#if data.questions.length === 0}
	<p class="empty">No {data.statusFilter === 'all' ? '' : data.statusFilter} questions.</p>
{:else}
	<ol class="question-list">
		{#each data.questions as q (q.id)}
			<li class="question-card">
				<div class="question-meta">
					<span class="status-chip {q.status.toLowerCase()}">{q.status}</span>
					<span class="asker">{q.user.displayName ?? q.user.username}</span>
					<time datetime={q.createdAt.toISOString()}>{dateFmt.format(q.createdAt)}</time>
					{#if q.lesson}
						<a class="lesson-link" href="/lessons/{q.lesson.id}">{q.lesson.title}</a>
					{/if}
				</div>

				<div class="question-target">
					{#if q.word}
						<a href={dictionaryEntryHref({ id: q.word.id, kalenjin: q.word.kalenjin, slug: q.word.slug })}>
							<strong>{q.word.kalenjin}</strong>
						</a>
						<span class="muted">— {q.word.translations}</span>
					{:else if q.sentence}
						<a href="/corpus/{q.sentence.id}"><strong>{q.sentence.kalenjin}</strong></a>
						<span class="muted">— {q.sentence.english}</span>
					{/if}
				</div>

				<p class="question-text">{q.question}</p>

				{#if q.status === 'ANSWERED' && q.answer}
					<div class="answer">
						<div class="answer-label">
							Answered by {q.answeredBy?.displayName ?? q.answeredBy?.username ?? 'an editor'}
						</div>
						<p class="answer-text">{q.answer}</p>
					</div>
				{/if}

				<div class="question-actions">
					{#if q.status === 'OPEN'}
						{#if answeringId === q.id}
							<form method="POST" action="?/answer" use:enhance={submitHandler} class="answer-form">
								<input type="hidden" name="questionId" value={q.id} />
								<!-- svelte-ignore a11y_autofocus — opened by an explicit editor action -->
								<textarea
									class="input"
									name="answer"
									rows="3"
									maxlength="4000"
									placeholder="Explain it for the learner…"
									autofocus
									required
								></textarea>
								<div class="answer-form-actions">
									<button type="button" class="btn-sm ghost" onclick={() => (answeringId = null)}>
										Cancel
									</button>
									<button type="submit" class="btn-sm">Send answer</button>
								</div>
							</form>
						{:else}
							<button type="button" class="btn-sm" onclick={() => (answeringId = q.id)}>
								Answer
							</button>
							<form method="POST" action="?/dismiss" use:enhance={submitHandler}>
								<input type="hidden" name="questionId" value={q.id} />
								<button type="submit" class="btn-sm ghost">Dismiss</button>
							</form>
						{/if}
					{:else}
						<form method="POST" action="?/reopen" use:enhance={submitHandler}>
							<input type="hidden" name="questionId" value={q.id} />
							<button type="submit" class="btn-sm ghost">Reopen</button>
						</form>
					{/if}
				</div>
			</li>
		{/each}
	</ol>
{/if}

<style>
	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 1rem 0 1.2rem;
	}

	.filter-chip {
		align-items: center;
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-soft);
		display: inline-flex;
		font-size: 13px;
		gap: 0.35rem;
		padding: 0.25rem 0.75rem;
		text-decoration: none;
	}

	.filter-chip.active {
		background: var(--brand);
		border-color: var(--brand);
		color: var(--on-brand, #fff);
	}

	.filter-count {
		font-size: 11.5px;
		opacity: 0.75;
	}

	.empty {
		color: var(--ink-mute);
	}

	.question-list {
		display: grid;
		gap: 0.9rem;
		list-style: none;
		margin: 0;
		max-width: 760px;
		padding: 0;
	}

	.question-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg, 10px);
		display: grid;
		gap: 0.55rem;
		padding: 1rem 1.2rem;
	}

	.question-meta {
		align-items: center;
		color: var(--ink-mute);
		display: flex;
		flex-wrap: wrap;
		font-size: 12.5px;
		gap: 0.6rem;
	}

	.status-chip {
		border-radius: 999px;
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.05em;
		padding: 0.1rem 0.5rem;
	}

	.status-chip.open {
		background: color-mix(in oklab, var(--accent) 22%, transparent);
		color: var(--accent);
	}

	.status-chip.answered {
		background: color-mix(in oklab, var(--brand) 20%, transparent);
		color: var(--brand);
	}

	.status-chip.dismissed {
		background: color-mix(in oklab, var(--line) 55%, transparent);
		color: var(--ink-mute);
	}

	.asker {
		font-weight: 600;
	}

	.lesson-link {
		color: var(--ink-soft);
	}

	.question-target {
		font-size: 14.5px;
	}

	.muted {
		color: var(--ink-mute);
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
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.answer-text {
		color: var(--ink-soft);
		margin: 0;
		white-space: pre-line;
	}

	.question-actions {
		align-items: center;
		display: flex;
		gap: 0.5rem;
	}

	.answer-form {
		display: grid;
		gap: 0.5rem;
		width: 100%;
	}

	.answer-form textarea {
		resize: vertical;
	}

	.answer-form-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}
</style>
