<script lang="ts">
	import { PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import HomeWordOfDay from '$lib/components/home/HomeWordOfDay.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const longFmt = new Intl.DateTimeFormat(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const shortFmt = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});

	function firstTranslation(text: string): string {
		return text.split(/[,;]+/)[0]?.trim() ?? '';
	}
</script>

<svelte:head>
	<title>Word of the day · Archive</title>
</svelte:head>

<div class="page-head">
	<div>
		<div class="page-kicker">Word of the day</div>
		<h1>Archive</h1>
		<p>Today's word plus every word that has been featured before.</p>
	</div>
	{#if data.current}
		<div class="page-stat">
			<b>{longFmt.format(data.current.date)}</b>
			today
		</div>
	{/if}
</div>

{#if data.current}
	<HomeWordOfDay word={data.current.word} />
{/if}

<section class="wod-archive">
	<div class="recent-col-head">Previously featured</div>
	{#if data.history.length === 0}
		<p class="wod-archive-empty">No past entries yet — check back tomorrow.</p>
	{:else}
		<ol class="wod-archive-list">
			{#each data.history as entry (entry.id)}
				<li>
					<a class="wod-archive-entry" href={`/dictionary/${entry.word.id}`}>
						<time class="wod-archive-date mono" datetime={entry.date.toISOString().slice(0, 10)}>
							{shortFmt.format(entry.date)}
						</time>
						<span class="wod-archive-word">{entry.word.kalenjin}</span>
						{#if entry.word.partOfSpeech}
							<span class="pos-chip tiny">{PART_OF_SPEECH_LABELS[entry.word.partOfSpeech]}</span>
						{/if}
						<span class="wod-archive-gloss">{firstTranslation(entry.word.translations)}</span>
					</a>
				</li>
			{/each}
		</ol>
	{/if}
</section>
