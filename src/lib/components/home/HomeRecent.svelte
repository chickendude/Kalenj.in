<script lang="ts">
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';
	import PartOfSpeechInline from '$lib/components/PartOfSpeechInline.svelte';
	import TokenHoverPreview from '$lib/components/TokenHoverPreview.svelte';
	import { firstTranslation } from '$lib/translations';
	import { stripWordLinks } from '$lib/word-links';
	import { dictionaryEntryHref } from '$lib/word-url';
	import { getI18n } from '$lib/i18n/index.svelte';
	import type { PartOfSpeech } from '@prisma/client';

	const { t } = getI18n();

	type RecentWord = {
		id: string;
		kalenjin: string;
		translations: string;
		partOfSpeech: PartOfSpeech | null;
		audioUrl: string | null;
	};

	type RecentSentenceToken = {
		id: string;
		tokenOrder: number;
		surfaceForm: string;
		word?: { id: string; kalenjin: string; translations: string } | null;
		segments?: Array<{
			id: string;
			surfaceForm: string;
			word?: { id: string; kalenjin: string; translations: string } | null;
		}>;
	};

	type RecentSentence = {
		id: string;
		kalenjin: string;
		english: string;
		audioUrl: string | null;
		tokens: RecentSentenceToken[];
	};

	let {
		words,
		sentences
	}: { words: RecentWord[]; sentences: RecentSentence[] } = $props();
</script>

<section class="home-section recent">
	<div class="home-section-head">
		<div class="home-kicker">{t('home.recentlyAdded')}</div>
		<a class="home-section-link" href="/stats">{t('home.viewActivity')}</a>
	</div>
	<div class="recent-grid">
		<div>
			<div class="recent-col-head">{t('home.entries')}</div>
			{#if words.length === 0}
				<p class="recent-empty">{t('home.noEntriesYet')}</p>
			{:else}
				<ul class="recent-list">
					{#each words as word (word.id)}
						<li class="recent-row">
							<AudioPlayButton
								audioUrl={word.audioUrl}
								size="sm"
								label={t('home.playPronunciation', { word: word.kalenjin })}
							/>
							<a href={dictionaryEntryHref(word)} class="recent-entry">
								<span class="recent-word">{word.kalenjin}</span>
								{#if word.partOfSpeech}
									<PartOfSpeechInline value={word.partOfSpeech} size="tiny" />
								{/if}
								<span class="recent-gloss">{firstTranslation(stripWordLinks(word.translations))}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<div>
			<div class="recent-col-head">{t('home.sentences')}</div>
			{#if sentences.length === 0}
				<p class="recent-empty">{t('home.noSentencesYet')}</p>
			{:else}
				<ul class="recent-list">
					{#each sentences as sentence (sentence.id)}
						<li>
							<div class="recent-sent sentence-card">
								<div class="recent-kal">
									<AudioPlayButton
										audioUrl={sentence.audioUrl}
										size="sm"
										label={t('home.playSentence')}
									/>
									<TokenHoverPreview
										sentenceId={sentence.id}
										sentenceText={sentence.kalenjin}
										tokens={sentence.tokens}
									/>
								</div>
								<a class="recent-en sentence-card-link" href={`/corpus/${sentence.id}`}>
									<SentenceTimeText text={sentence.english} />
								</a>
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
	.recent-row {
		align-items: center;
		display: flex;
		gap: 8px;
	}
	.recent-row .recent-entry {
		flex: 1;
		min-width: 0;
	}
	:global(.recent-kal) {
		align-items: baseline;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.home-section-link {
		font-size: 12px;
		letter-spacing: 0.08em;
		color: var(--ink-soft);
		text-decoration: none;
	}
	.home-section-link:hover {
		color: var(--accent);
	}
</style>
