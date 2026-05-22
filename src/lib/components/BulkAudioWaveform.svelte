<script lang="ts">
	// Presentational seek bar for a recorded clip. The bar heights (`bars`) are
	// computed by the parent; this component only renders and reports seeks.
	let {
		bars,
		playing = false,
		progress = 0,
		onSeek
	}: {
		bars: number[];
		playing?: boolean;
		progress?: number;
		onSeek: (fraction: number) => void;
	} = $props();
</script>

<div
	class="waveform"
	class:playing
	role="slider"
	tabindex="0"
	aria-label="Seek"
	aria-valuemin="0"
	aria-valuemax="100"
	aria-valuenow={Math.round((playing ? progress : 0) * 100)}
	onclick={(e) => {
		const target = e.currentTarget as HTMLElement;
		const r = target.getBoundingClientRect();
		const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
		onSeek(p);
	}}
	onkeydown={(e) => {
		if (e.key === 'ArrowLeft') onSeek(Math.max(0, progress - 0.05));
		else if (e.key === 'ArrowRight') onSeek(Math.min(1, progress + 0.05));
	}}
>
	{#each bars as h, bi (bi)}
		{@const played = playing && bi / bars.length <= progress}
		<div class="bar" class:played style:height="{Math.round(h * 100)}%"></div>
	{/each}
</div>

<style>
	.waveform {
		align-items: center;
		cursor: pointer;
		display: flex;
		flex: 1;
		gap: 1.5px;
		height: 28px;
		padding: 4px 0;
	}
	.waveform .bar {
		background: var(--ink-mute);
		border-radius: 1px;
		flex: 1;
		min-width: 2px;
		opacity: 0.4;
		transition:
			background 0.1s,
			opacity 0.1s;
	}
	.waveform .bar.played {
		background: var(--brand);
		opacity: 0.9;
	}
	.waveform.playing .bar.played {
		background: var(--accent);
	}
</style>
