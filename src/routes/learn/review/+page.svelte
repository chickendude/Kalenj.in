<script lang="ts">
	import { onMount } from 'svelte';
	import ReviewSession, { type ReviewCard } from '$lib/components/learn/ReviewSession.svelte';
	import { localDueCards } from '$lib/learn/local-progress';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Signed out: the SRS state lives in localStorage; only the card content
	// (words, sentences) comes from the server.
	let localCards = $state<ReviewCard[] | null>(null);
	let loadFailed = $state(false);

	async function loadLocalQueue() {
		loadFailed = false;
		const due = localDueCards();
		if (due.length === 0) {
			localCards = [];
			return;
		}
		try {
			const res = await fetch('/api/learn/card-content', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cards: due.map((card) => ({
						wordId: card.wordId,
						standaloneLessonWordId: card.standaloneLessonWordId,
						contextLessonWordId: card.contextLessonWordId
					}))
				})
			});
			if (!res.ok) throw new Error();
			const body = (await res.json()) as {
				cards: Array<Pick<
					ReviewCard,
					'word' | 'standaloneLessonWord' | 'contextLessonWord'
				> | null>;
			};
			// Cards whose content no longer resolves (unpublished/deleted) are
			// dropped from this session.
			localCards = due
				.map((card, index) => {
					const content = body.cards[index];
					if (!content) return null;
					return {
						id: card.id,
						ease: card.ease,
						intervalDays: card.intervalDays,
						reps: card.reps,
						lapses: card.lapses,
						word: content.word,
						standaloneLessonWord: content.standaloneLessonWord,
						contextLessonWord: content.contextLessonWord
					};
				})
				.filter((card): card is ReviewCard => card !== null);
		} catch {
			loadFailed = true;
		}
	}

	onMount(() => {
		if (!data.user) void loadLocalQueue();
	});
</script>

<svelte:head>
	<title>Review · Learn</title>
</svelte:head>

{#if data.cards}
	<ReviewSession cards={data.cards} />
{:else if localCards}
	<ReviewSession cards={localCards} local />
{:else if loadFailed}
	<div class="review-load-error">
		<p>Couldn't load your reviews. Check your connection.</p>
		<button type="button" class="btn" onclick={() => void loadLocalQueue()}>Try again</button>
	</div>
{:else if !data.user}
	<p class="review-loading">Loading your reviews…</p>
{/if}

<style>
	.review-loading {
		color: var(--ink-mute);
		margin: 2rem auto;
		max-width: 720px;
		text-align: center;
	}

	.review-load-error {
		display: grid;
		gap: 0.8rem;
		justify-items: center;
		margin: 2rem auto;
		max-width: 720px;
		text-align: center;
	}
</style>
