<script lang="ts">
	import { PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';
	import { parseTranslationList } from '$lib/translations';
	import { WORD_OF_THE_DAY_TIME_ZONE } from '$lib/word-of-the-day';
	import type { PartOfSpeech } from '@prisma/client';

	type ExampleToken = {
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

	type ExampleSentence = {
		id: string;
		kalenjin: string;
		english: string;
		tokens: ExampleToken[];
	};

	type WordOfDay = {
		id: string;
		kalenjin: string;
		translations: string;
		partOfSpeech: PartOfSpeech | null;
		pluralForm: string | null;
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
		<div class="home-kicker">Word of the day</div>
		<a class="home-section-sub mono wod-archive-link" href="/word-of-the-day">
			{todayLabel} · archive
		</a>
	</div>

	<div class="wod-body">
		<div class="wod-main">
			<div class="wod-headword">
				<a href={`/dictionary/${word.id}`} class="wod-word">{word.kalenjin}</a>
			</div>
			<div class="wod-meta">
				{#if word.partOfSpeech}
					<span class="pos-chip">{PART_OF_SPEECH_LABELS[word.partOfSpeech]}</span>
				{/if}
				{#if word.pluralForm && word.pluralForm !== word.kalenjin}
					<span>pl. <em class="wod-alt">{word.pluralForm}</em></span>
				{/if}
				{#if altSpellings.length > 0}
					<span>also <em class="wod-alt">{altSpellings.join(', ')}</em></span>
				{/if}
			</div>
			{#if translationList.length > 0}
				<ol class="wod-trans">
					{#each translationList as translation, i (i)}
						<li><span class="num mono">{i + 1}.</span>{translation}</li>
					{/each}
				</ol>
			{/if}
		</div>

		<aside class="wod-aside">
			{#if example}
				<div class="home-kicker small">In a sentence</div>
				<div class="wod-example">
					<div class="wod-kal">
						<TokenHoverPreview
							sentenceId={example.id}
							sentenceText={example.kalenjin}
							tokens={example.tokens}
						/>
					</div>
					<div class="wod-en"><SentenceTimeText text={example.english} /></div>
				</div>
			{:else}
				<div class="home-kicker small">
					No example yet — <a href="/corpus">add one</a>.
				</div>
			{/if}
			<a href={`/dictionary/${word.id}`} class="wod-more">
				<span>Full entry</span>
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
