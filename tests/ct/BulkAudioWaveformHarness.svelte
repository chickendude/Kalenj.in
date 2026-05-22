<script lang="ts">
	import BulkAudioWaveform from '../../src/lib/components/BulkAudioWaveform.svelte';

	let {
		bars = [0.5, 0.5, 0.5, 0.5],
		playing = false,
		progress = 0
	}: {
		bars?: number[];
		playing?: boolean;
		progress?: number;
	} = $props();

	let lastSeek = $state<number | null>(null);
</script>

<BulkAudioWaveform {bars} {playing} {progress} onSeek={(p) => (lastSeek = p)} />
<div data-testid="last-seek">{lastSeek === null ? '' : lastSeek}</div>
