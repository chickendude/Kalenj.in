<script lang="ts">
	import HomeSearch from '$lib/components/home/HomeSearch.svelte';
	import HomeWordOfDay from '$lib/components/home/HomeWordOfDay.svelte';
	import HomeRecent from '$lib/components/home/HomeRecent.svelte';

	let { data } = $props();
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
	</section>

	<HomeSearch totalCount={data.wordCount} />

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

	{#if data.wordOfDay}
		<HomeWordOfDay word={data.wordOfDay} />
	{/if}

	<HomeRecent words={data.recentWords} sentences={data.recentSentences} />
</div>
