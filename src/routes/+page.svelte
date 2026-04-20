<script lang="ts">
	import HomeSearch from '$lib/components/home/HomeSearch.svelte';
	import HomeWordOfDay from '$lib/components/home/HomeWordOfDay.svelte';
	import HomeRecent from '$lib/components/home/HomeRecent.svelte';

	let { data } = $props();

	const year = new Date().getFullYear();
</script>

<svelte:head>
	<title>Kalenj.in — Dictionary &amp; Corpus</title>
</svelte:head>

<div class="home">
	<section class="home-mast">
		<h1 class="home-greeting">
			Chamgei<span class="g-dot">,</span> chorwenyun<span class="g-bang">!</span>
		</h1>
		<div class="home-greeting-en">Hello, my friend.</div>
		<div class="home-stats">
			<a class="home-stat" href="/dictionary">
				<b>{data.wordCount.toLocaleString()}</b>
				<span>headword{data.wordCount === 1 ? '' : 's'}</span>
			</a>
			<a class="home-stat" href="/corpus">
				<b>{data.sentenceCount.toLocaleString()}</b>
				<span>sentence{data.sentenceCount === 1 ? '' : 's'}</span>
			</a>
		</div>
	</section>

	<HomeSearch totalCount={data.wordCount} />

	{#if data.wordOfDay}
		<HomeWordOfDay word={data.wordOfDay} />
	{/if}

	<HomeRecent words={data.recentWords} sentences={data.recentSentences} />

	<footer class="home-foot mono">
		<p class="home-lede">
			Kalenj.in is a project to document and record the <em>kutitab myot</em> — the language of
			sweetness — and provide resources for natives, heritage speakers, and learners of the Kalenjin
			language.
		</p>

		<span class="home-foot-phrase">Kongoi missing en inye ne inetegee Kalenjin, kinetegee tugul mutyo mutyo</span> · {year}
	</footer>
</div>
