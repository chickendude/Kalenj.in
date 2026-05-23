<script lang="ts">
	import {
		activeSegmentIndex,
		computeSplitParts,
		partIndexForChar
	} from '$lib/token-annotations';

	type Segment = {
		id: string;
		surfaceForm: string;
		word?: unknown | null;
	};

	let {
		surface,
		splits,
		segments,
		activeSegmentId,
		onSplitClick,
		onUnsplit,
		onSelectSegment
	}: {
		surface: string;
		splits: number[];
		segments: Segment[];
		activeSegmentId: string | null;
		onSplitClick: (boundary: number) => void;
		onUnsplit: () => void;
		onSelectSegment: (segmentId: string) => void;
	} = $props();

	const splittableSurface = $derived(surface.replace(/[^\p{L}\p{M}\p{N}]+$/u, ''));
	const hasCommittedSegments = $derived(segments.length > 1);
	const previewParts = $derived(computeSplitParts(splittableSurface, splits));
	const activeSegIdx = $derived(
		activeSegmentId
			? activeSegmentIndex({ segments }, { id: activeSegmentId })
			: -1
	);
</script>

{#if splittableSurface.length > 1}
	<div class="splitter-block">
		<div class="splitter-row-head">
			<span class="splitter-label">Word parts</span>
			<span class="splitter-hint">
				{#if hasCommittedSegments}
					Linking {segments.length} parts separately — click a split to remove it.
				{:else}
					Click a letter to split after it (e.g. ka|mama → ka + mama).
				{/if}
			</span>
			{#if hasCommittedSegments}
				<button type="button" class="btn ghost sm splitter-clear" onclick={onUnsplit}>
					Undo splits
				</button>
			{/if}
		</div>
		<div class="splitter" role="group" aria-label={`Split ${splittableSurface}`}>
			{#each Array.from(splittableSurface) as ch, i}
				{@const partIdx = partIndexForChar(i, splits)}
				{@const isLast = i === splittableSurface.length - 1}
				{@const hasSplitAfter = !isLast && splits.includes(i + 1)}
				<button
					type="button"
					class={`splitter-char part-tint-${partIdx % 4}`}
					class:has-split-after={hasSplitAfter}
					data-active={activeSegIdx >= 0 && partIdx === activeSegIdx ? 'true' : 'false'}
					aria-label={isLast
						? `Letter ${ch}`
						: hasSplitAfter
							? `Remove split after "${ch}"`
							: `Split after "${ch}"`}
					disabled={isLast}
					onclick={() => onSplitClick(i + 1)}
				>
					{ch}
				</button>
				{#if hasSplitAfter}
					<span class="splitter-split-marker" aria-hidden="true"></span>
				{/if}
			{/each}
		</div>

		{#if hasCommittedSegments}
			<div class="part-tabs" role="tablist">
				{#each segments as seg, segIdx}
					<button
						type="button"
						role="tab"
						aria-selected={seg.id === activeSegmentId}
						class={`part-tab part-tint-${segIdx % 4}`}
						class:active={seg.id === activeSegmentId}
						onclick={() => onSelectSegment(seg.id)}
					>
						<span class="part-tab-num">Part {segIdx + 1}</span>
						<span class="part-tab-word">{seg.surfaceForm}</span>
						{#if seg.word}
							<span class="part-tab-mark">●</span>
						{/if}
					</button>
				{/each}
			</div>
		{:else if previewParts.length > 1}
			<div class="part-tabs part-tabs-preview" aria-label="Preview of split parts">
				{#each previewParts as p, i}
					<div class={`part-tab part-tint-${i % 4}`}>
						<span class="part-tab-num">Part {i + 1}</span>
						<span class="part-tab-word">{p.text}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.splitter-block {
		background: color-mix(in oklch, var(--surface) 50%, var(--bg-raised));
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		margin-bottom: 18px;
		padding: 14px 16px 12px;
	}
	.splitter-row-head {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-bottom: 12px;
	}
	.splitter-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.splitter-hint {
		color: var(--ink-soft);
		flex: 1;
		font-size: 12px;
		min-width: 0;
	}
	.splitter-clear {
		margin-left: auto;
	}
	.splitter {
		align-items: stretch;
		background: var(--bg-raised);
		border: 1px solid var(--line-soft);
		border-radius: var(--radius);
		display: flex;
		gap: 2px;
		overflow-x: auto;
		padding: 8px 6px;
	}
	.splitter-char {
		background: color-mix(in oklch, var(--bg-raised) 80%, transparent);
		border: 0;
		border-right: 2px solid transparent;
		border-radius: 4px;
		color: var(--ink);
		cursor: pointer;
		font-family: var(--font-display);
		font-size: 28px;
		font-weight: 500;
		letter-spacing: 0;
		min-width: 32px;
		padding: 6px 10px;
		text-align: center;
		transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease,
			transform 0.05s ease;
	}
	.splitter .splitter-char:not(:disabled):hover {
		background: color-mix(in oklch, var(--accent) 32%, var(--bg-raised));
		border-right-color: var(--accent);
		color: var(--brand-ink);
	}
	.splitter-char:not(:disabled):active {
		transform: translateY(1px);
	}
	.splitter-char:disabled {
		cursor: default;
	}
	.splitter-char[data-active='true'] {
		color: var(--brand-ink);
	}
	.splitter-split-marker {
		align-self: stretch;
		background-color: transparent;
		background-image: repeating-linear-gradient(
			to bottom,
			var(--accent) 0 4px,
			transparent 4px 7px
		);
		border-radius: 2px;
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 18%, transparent);
		margin: 4px 4px;
		width: 3px;
	}

	.part-tint-0 { --part-c: var(--brand); }
	.part-tint-1 { --part-c: var(--accent); }
	.part-tint-2 { --part-c: oklch(0.5 0.08 220); }
	.part-tint-3 { --part-c: oklch(0.48 0.1 300); }
	.splitter .splitter-char.part-tint-0 {
		background: color-mix(in oklch, var(--brand) 10%, var(--bg-raised));
	}
	.splitter .splitter-char.part-tint-1 {
		background: color-mix(in oklch, var(--accent) 10%, var(--bg-raised));
	}
	.splitter .splitter-char.part-tint-2 {
		background: color-mix(in oklch, oklch(0.5 0.08 220) 10%, var(--bg-raised));
	}
	.splitter .splitter-char.part-tint-3 {
		background: color-mix(in oklch, oklch(0.48 0.1 300) 10%, var(--bg-raised));
	}
	.splitter .splitter-char[data-active='true'].part-tint-0 {
		background: color-mix(in oklch, var(--brand) 22%, var(--bg-raised));
	}
	.splitter .splitter-char[data-active='true'].part-tint-1 {
		background: color-mix(in oklch, var(--accent) 22%, var(--bg-raised));
	}
	.splitter .splitter-char[data-active='true'].part-tint-2 {
		background: color-mix(in oklch, oklch(0.5 0.08 220) 22%, var(--bg-raised));
	}
	.splitter .splitter-char[data-active='true'].part-tint-3 {
		background: color-mix(in oklch, oklch(0.48 0.1 300) 22%, var(--bg-raised));
	}

	.part-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 10px;
	}
	.part-tab {
		align-items: baseline;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-bottom-color: var(--line);
		border-bottom-width: 3px;
		border-radius: var(--radius) var(--radius) 0 0;
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		gap: 8px;
		padding: 8px 12px 7px;
	}
	.part-tabs-preview .part-tab {
		cursor: default;
		opacity: 0.85;
	}
	.part-tab .part-tab-num {
		color: var(--ink-mute);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.part-tab .part-tab-word {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 500;
	}
	.part-tab .part-tab-mark {
		color: var(--part-c, var(--brand));
		font-size: 10px;
	}
	.part-tab:hover {
		border-color: var(--ink-mute);
	}
	.part-tab.active {
		background: var(--bg-raised);
		border-bottom-color: var(--part-c, var(--brand));
	}
	.part-tab.active .part-tab-word {
		color: var(--brand-ink);
	}
	.part-tab.active .part-tab-num {
		color: var(--part-c, var(--brand));
	}

	@media (max-width: 720px) {
		.splitter-char {
			font-size: 24px;
			min-width: 28px;
			padding: 4px 8px;
		}
	}
</style>
