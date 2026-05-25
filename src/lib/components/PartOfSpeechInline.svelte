<script lang="ts">
	import WordPill from '$lib/components/WordPill.svelte';
	import { PART_OF_SPEECH_ABBREVIATIONS, PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import type { PartOfSpeech } from '@prisma/client';

	let {
		value,
		size = 'default'
	}: {
		value: PartOfSpeech;
		size?: 'default' | 'tiny';
	} = $props();

	const abbreviation = $derived(PART_OF_SPEECH_ABBREVIATIONS[value]);
	const fullLabel = $derived(PART_OF_SPEECH_LABELS[value].toLowerCase());
</script>

<WordPill text={abbreviation} tooltip={fullLabel} {size} lowercase />
