<script lang="ts">
	import LessonPlayer from '$lib/components/learn/LessonPlayer.svelte';
	import { localLessonProgress, type LocalLessonProgress } from '$lib/learn/local-progress';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Signed out, progress lives in localStorage — read it client-side (it
	// doesn't exist during SSR) and only then render the player, so the
	// resume prompt sees the stored step. An $effect (not onMount) so it
	// re-runs on lesson→lesson navigation, which reuses this component.
	let localProgress = $state<LocalLessonProgress | null>(null);
	let localReady = $state(false);
	$effect(() => {
		if (!data.user) {
			localProgress = localLessonProgress(data.lesson.id);
			localReady = true;
		}
	});
</script>

<svelte:head>
	<title>{data.lesson.title} · Learn</title>
</svelte:head>

<!-- Keyed so lesson→lesson navigation (same route, reused component) starts
     the player fresh instead of keeping the previous lesson's step state. -->
{#key data.lesson.id}
	{#if data.user}
		<LessonPlayer lesson={data.lesson} progress={data.progress} />
	{:else if localReady}
		<LessonPlayer
			lesson={data.lesson}
			progress={localProgress}
			local
			nextLessonSlug={data.nextLessonSlug}
		/>
	{/if}
{/key}
