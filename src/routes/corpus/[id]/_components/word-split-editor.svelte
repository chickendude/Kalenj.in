<script lang="ts">
	let { tokenId, surface, splitting = false, onApplySplit } = $props<{
		tokenId: string;
		surface: string;
		splitting?: boolean;
		onApplySplit: (tokenId: string, splitPoints: number[]) => void | Promise<void>;
	}>();

	let splitMarkers = $state<number[]>([]);
	let hoveredMarker = $state<number | null>(null);

	function toggleSplitMarker(boundary: number): void {
		if (boundary <= 0 || boundary >= surface.length) {
			return;
		}

		if (splitMarkers.includes(boundary)) {
			splitMarkers = splitMarkers.filter((value) => value !== boundary);
		} else {
			splitMarkers = [...splitMarkers, boundary].sort((a, b) => a - b);
		}
	}

	function previewSplit(): string {
		const boundaries = [...splitMarkers];
		if (
			hoveredMarker !== null &&
			hoveredMarker > 0 &&
			hoveredMarker < surface.length &&
			!boundaries.includes(hoveredMarker)
		) {
			boundaries.push(hoveredMarker);
		}

		const points = boundaries.sort((a, b) => a - b);
		let output = '';
		for (let i = 0; i < surface.length; i += 1) {
			output += surface[i];
			if (points.includes(i + 1)) {
				output += '|';
			}
		}

		return output;
	}

	function applySplit(): void {
		if (splitMarkers.length === 0 || splitting) {
			return;
		}

		void onApplySplit(tokenId, [...splitMarkers]);
	}
</script>

<div class="word-editor">
	{#each Array.from(surface) as char, index}
		<button
			type="button"
			class="letter-char"
			onclick={() => (index < surface.length - 1 ? toggleSplitMarker(index + 1) : null)}
			onmouseenter={() => (hoveredMarker = index < surface.length - 1 ? index + 1 : null)}
			onmouseleave={() => (hoveredMarker = null)}
		>
			{char}
		</button>
		{#if index < surface.length - 1}
			<span
				class="marker-inline"
				class:active={splitMarkers.includes(index + 1)}
				class:hovered={hoveredMarker === index + 1}
			>
				|
			</span>
		{/if}
	{/each}
</div>
<small class="preview">{previewSplit()}</small>
<div>
	<button type="button" disabled={splitting || splitMarkers.length === 0} onclick={applySplit}>
		{splitting ? 'Splitting...' : 'Apply split'}
	</button>
</div>

<style>
	.word-editor {
		align-items: center;
		display: flex;
		margin-top: 0.4rem;
	}

	.letter-char {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		padding: 0;
	}

	.marker-inline {
		color: #bbb;
		font-weight: 700;
		margin: 0 0.1rem;
	}

	.marker-inline.active {
		color: #1a7f37;
	}

	.marker-inline.hovered {
		color: #0a66c2;
	}

	.preview {
		display: block;
		margin: 0.35rem 0;
	}

	button {
		font: inherit;
		padding: 0.4rem 0.45rem;
	}
</style>
