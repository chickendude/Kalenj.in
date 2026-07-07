<script lang="ts">
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import LearnFeedbackActions from '$lib/components/learn/LearnFeedbackActions.svelte';
	import SentenceRevealCard from '$lib/components/learn/SentenceRevealCard.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { stripWordLinks } from '$lib/word-links';
	import type { LearnLessonWord } from '$lib/learn/lesson-steps';

	let { lessonWord }: { lessonWord: LearnLessonWord } = $props();

	const word = $derived(lessonWord.word);
	const translations = $derived(stripWordLinks(lessonWord.translations));
	const imageUrl = $derived(word?.imageUrl ?? lessonWord.sentence?.imageUrl ?? null);

	const conjugations = $derived.by(() => {
		if (!word) return [];
		return [
			{ label: 'anee', value: word.presentAnee },
			{ label: 'inyee', value: word.presentInyee },
			{ label: 'inee', value: word.presentInee },
			{ label: 'echek', value: word.presentEchek },
			{ label: 'okwek', value: word.presentOkwek },
			{ label: 'ichek', value: word.presentIchek }
		].filter((entry): entry is { label: string; value: string } => Boolean(entry.value?.trim()));
	});
</script>

<div class="word-intro">
	<div class="word-kicker">New word</div>
	<div class="headword-row">
		<h2 class="headword">{lessonWord.kalenjin}</h2>
		<AudioPlayButton audioUrl={word?.audioUrl} label="Play word pronunciation" />
	</div>
	<p class="translations">{translations}</p>

	{#if word?.pluralForm && !word.isPluralOnly}
		<div class="plural-row">
			<span class="detail-label">Plural</span>
			<span class="plural-form">{word.pluralForm}</span>
			<AudioPlayButton audioUrl={word.pluralAudioUrl} size="sm" label="Play plural pronunciation" />
		</div>
	{/if}

	{#if conjugations.length > 0}
		<details class="conjugations">
			<summary>Present tense forms</summary>
			<div class="conjugation-grid">
				{#each conjugations as entry (entry.label)}
					<span class="conjugation-label">{entry.label}</span>
					<span class="conjugation-value">{entry.value}</span>
				{/each}
			</div>
		</details>
	{/if}

	{#if imageUrl}
		<img class="word-image" src={imageUrl} alt="" loading="lazy" />
	{/if}

	{#if lessonWord.sentence}
		<div class="example">
			<div class="detail-label">Example</div>
			<SentenceRevealCard
				sentence={lessonWord.sentence}
				translationOverride={lessonWord.sentenceTranslation}
				autoplayAudio
				translationRevealed
			/>
			{#if lessonWord.wordForWordTranslation?.trim()}
				<p class="word-for-word">{lessonWord.wordForWordTranslation}</p>
			{/if}
		</div>
	{/if}

	{#if lessonWord.notesMarkdown?.trim()}
		<div class="notes">
			<!-- eslint-disable-next-line svelte/no-at-html-tags — renderMarkdown escapes HTML -->
			{@html renderMarkdown(lessonWord.notesMarkdown)}
		</div>
	{/if}

	{#if lessonWord.wordId}
		<LearnFeedbackActions
			targetType="WORD"
			targetId={lessonWord.wordId}
			targetLabel={`Word: ${lessonWord.kalenjin}`}
		/>
	{:else if lessonWord.sentence}
		<LearnFeedbackActions
			targetType="SENTENCE"
			targetId={lessonWord.sentence.id}
			targetLabel={`Sentence: ${lessonWord.sentence.kalenjin}`}
		/>
	{/if}
</div>

<style>
	.word-intro {
		display: grid;
		gap: 0.7rem;
		justify-items: start;
		text-align: left;
	}

	.word-kicker {
		color: var(--brand);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.headword-row {
		align-items: center;
		display: flex;
		gap: 0.8rem;
	}

	.headword {
		font-family: var(--font-display, inherit);
		font-size: 2.4rem;
		line-height: 1.15;
		margin: 0;
	}

	.translations {
		color: var(--ink-soft);
		font-size: 1.15rem;
		margin: 0;
	}

	.plural-row {
		align-items: center;
		display: flex;
		gap: 0.5rem;
	}

	.plural-form {
		font-weight: 600;
	}

	.detail-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.conjugations {
		border: 1px solid var(--line);
		border-radius: var(--radius, 6px);
		font-size: 14px;
		padding: 0.4rem 0.7rem;
	}

	.conjugations summary {
		color: var(--ink-soft);
		cursor: pointer;
		font-weight: 500;
	}

	.conjugation-grid {
		display: grid;
		gap: 0.25rem 0.9rem;
		grid-template-columns: auto 1fr;
		margin-top: 0.5rem;
	}

	.conjugation-label {
		color: var(--ink-mute);
		font-style: italic;
	}

	.conjugation-value {
		font-weight: 600;
	}

	.word-image {
		border-radius: var(--radius-lg, 10px);
		max-height: 200px;
		max-width: 100%;
		object-fit: cover;
	}

	.example {
		border-top: 1px solid var(--line);
		display: grid;
		gap: 0.6rem;
		margin-top: 0.4rem;
		padding-top: 0.9rem;
		width: 100%;
	}

	.word-for-word {
		color: var(--ink-mute);
		font-size: 13px;
		font-style: italic;
		margin: 0;
	}

	.notes {
		color: var(--ink-soft);
		font-size: 14px;
		line-height: 1.55;
	}

	.notes :global(p) {
		margin: 0.25rem 0;
	}
</style>
