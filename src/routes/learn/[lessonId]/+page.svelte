<script lang="ts">
	import LessonPlayer from '$lib/components/learn/LessonPlayer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.lesson.title} · Learn</title>
</svelte:head>

<LessonPlayer lesson={data.lesson} progress={data.progress} />
