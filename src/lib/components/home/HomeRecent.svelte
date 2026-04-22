<script lang="ts">
	import { PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';
	import { firstTranslation } from '$lib/translations';
	import { stripWordLinks } from '$lib/word-links';
	import type { PartOfSpeech } from '@prisma/client';

	type RecentWord = {
		id: string;
		kalenjin: string;
		translations: string;
		partOfSpeech: PartOfSpeech | null;
	};

	type RecentSentenceToken = {
		id: string;
		tokenOrder: number;
		surfaceForm: string;
		word?: { kalenjin: string; translations: string } | null;
		segments?: Array<{
			id: string;
			surfaceForm: string;
			word?: { kalenjin: string; translations: string } | null;
		}>;
	};

	type RecentSentence = {
		id: string;
		kalenjin: string;
		english: string;
		tokens: RecentSentenceToken[];
	};

	let {
		words,
		sentences
	}: { words: RecentWord[]; sentences: RecentSentence[] } = $props();
</script>

<section class="home-section recent">
	<div class="home-section-head">
		<div class="home-kicker">Recently added</div>
	</div>
	<div class="recent-grid">
		<div>
			<div class="recent-col-head">Entries</div>
			{#if words.length === 0}
				<p class="recent-empty">No entries yet.</p>
			{:else}
				<ul class="recent-list">
					{#each words as word (word.id)}
						<li>
							<a href={`/dictionary/${word.id}`} class="recent-entry">
								<span class="recent-word">{word.kalenjin}</span>
								{#if word.partOfSpeech}
									<span class="pos-chip tiny">{PART_OF_SPEECH_LABELS[word.partOfSpeech]}</span>
								{/if}
								<span class="recent-gloss">{firstTranslation(stripWordLinks(word.translations))}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<div>
			<div class="recent-col-head">Sentences</div>
			{#if sentences.length === 0}
				<p class="recent-empty">No sentences yet.</p>
			{:else}
				<ul class="recent-list">
					{#each sentences as sentence (sentence.id)}
						<li>
							<div class="recent-sent">
								<div class="recent-kal">
									<TokenHoverPreview
										sentenceId={sentence.id}
										sentenceText={sentence.kalenjin}
										tokens={sentence.tokens}
									/>
								</div>
								<div class="recent-en">{sentence.english}</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</section>

<style>
	.recent-empty {
		margin: 10px 0 0;
		color: var(--ink-mute);
		font-size: 14px;
		font-style: italic;
	}
</style>
