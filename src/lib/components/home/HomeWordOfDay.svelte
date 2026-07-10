<script lang="ts">
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import { PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';
	import TokenHoverPreview from '$lib/components/TokenHoverPreview.svelte';
	import { parseTranslationList } from '$lib/translations';
	import { renderWordLinks } from '$lib/word-links';
	import { dictionaryEntryHref } from '$lib/word-url';
	import { WORD_OF_THE_DAY_TIME_ZONE } from '$lib/word-of-the-day';
	import { getI18n } from '$lib/i18n/index.svelte';
	import type { PartOfSpeech } from '@prisma/client';

	const { t, tSplit } = getI18n();

	type ExampleToken = {
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

	type ExampleSentence = {
		id: string;
		kalenjin: string;
		english: string;
		audioUrl: string | null;
		tokens: ExampleToken[];
	};

	type WordOfDay = {
		id: string;
		kalenjin: string;
		translations: string;
		partOfSpeech: PartOfSpeech | null;
		pluralForm: string | null;
		audioUrl: string | null;
		spellings: Array<{ spelling: string }>;
		sentences: Array<{ exampleSentence: ExampleSentence }>;
	};

	let { word }: { word: WordOfDay } = $props();

	const todayLabel = new Date().toLocaleDateString(undefined, {
		timeZone: WORD_OF_THE_DAY_TIME_ZONE,
		month: 'short',
		day: 'numeric'
	});

	const translationList = $derived(parseTranslationList(word.translations));

	const altSpellings = $derived(
		word.spellings
			.map((spelling) => spelling.spelling.trim())
			.filter((spelling) => spelling.length > 0 && spelling !== word.kalenjin)
	);

	const example = $derived(word.sentences[0]?.exampleSentence);
</script>

<section class="home-section wod">
	<div class="home-section-head">
		<div class="home-kicker">{t('home.wordOfDay')}</div>
		<a class="home-section-sub mono wod-archive-link" href="/word-of-the-day">
			{todayLabel} · {t('home.archive')}
		</a>
	</div>

	<div class="wod-body">
		<div class="wod-main">
			<div class="wod-headword">
				<a href={dictionaryEntryHref(word)} class="wod-word">{word.kalenjin}</a>
				<AudioPlayButton audioUrl={word.audioUrl} label={t('home.playPronunciation', { word: word.kalenjin })} />
			</div>
			<div class="wod-meta">
				{#if word.partOfSpeech}
					<span class="pos-chip">{PART_OF_SPEECH_LABELS[word.partOfSpeech]}</span>
				{/if}
				{#if word.pluralForm && word.pluralForm !== word.kalenjin}
					<span>{t('home.pluralAbbr')} <em class="wod-alt">{word.pluralForm}</em></span>
				{/if}
				{#if altSpellings.length > 0}
					<span>{t('home.alsoSpelled')} <em class="wod-alt">{altSpellings.join(', ')}</em></span>
				{/if}
			</div>
			{#if translationList.length > 0}
				<ol class="wod-trans">
					{#each translationList as translation, i (i)}
						<li>
							<span class="num mono">{i + 1}.</span>
							<span class="trans-text">{@html renderWordLinks(translation)}</span>
						</li>
					{/each}
				</ol>
			{/if}
		</div>

		<aside class="wod-aside">
			{#if example}
				<div class="home-kicker small">{t('home.inASentence')}</div>
				<div class="wod-example sentence-card">
					<div class="wod-kal">
						<TokenHoverPreview
							sentenceId={example.id}
							sentenceText={example.kalenjin}
							tokens={example.tokens}
						/>
						<AudioPlayButton audioUrl={example.audioUrl} size="sm" label={t('home.playSentence')} />
					</div>
					<a class="wod-en sentence-card-link" href={`/corpus/${example.id}`}>
						<SentenceTimeText text={example.english} />
					</a>
				</div>
			{:else}
				<div class="home-kicker small">
					{#each tSplit('home.noExampleYet', 'link') as part, i}{#if i > 0}<a href="/corpus">{t('home.addOne')}</a>{/if}{part}{/each}
				</div>
			{/if}
			<a href={dictionaryEntryHref(word)} class="wod-more">
				<span>{t('home.fullEntry')}</span>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
					<path
						d="M2 6h8M7 3l3 3-3 3"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</a>
		</aside>
	</div>
</section>
