<script lang="ts">
	import HomeSearch from '$lib/components/home/HomeSearch.svelte';
	import HomeWordOfDay from '$lib/components/home/HomeWordOfDay.svelte';
	import HomeRecent from '$lib/components/home/HomeRecent.svelte';
	import { getI18n } from '$lib/i18n/index.svelte';

	let { data } = $props();

	const { t } = getI18n();
</script>

<svelte:head>
	<title>{t('home.pageTitle')}</title>
</svelte:head>

<div class="home">
	<section class="home-mast">
		<h1 class="home-greeting">
			Chamgei<span class="g-dot">,</span> chorwenyun<span class="g-bang">!</span>
		</h1>
		<div class="home-greeting-en">{t('home.greetingTranslation')}</div>
	</section>

	<div class="home-top">
		<HomeSearch totalCount={data.wordCount} />

		<div class="home-stats">
			<a class="home-stat" href="/dictionary">
				<b>{data.wordCount.toLocaleString()}</b>
				<span>{data.wordCount === 1 ? t('home.headword.one') : t('home.headword.other')}</span>
			</a>
			<a class="home-stat" href="/corpus">
				<b>{data.sentenceCount.toLocaleString()}</b>
				<span>{data.sentenceCount === 1 ? t('home.sentence.one') : t('home.sentence.other')}</span>
			</a>
		</div>
	</div>

	{#if data.wordOfDay}
		<HomeWordOfDay word={data.wordOfDay} />
	{/if}

	<HomeRecent words={data.recentWords} sentences={data.recentSentences} />
</div>
