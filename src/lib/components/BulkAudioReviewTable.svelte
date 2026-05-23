<script lang="ts">
	import BulkAudioWaveform from './BulkAudioWaveform.svelte';
	import { fmtSecMs, hashId, seededWaveform } from '$lib/bulk-audio';

	type ReviewState = 'keep' | 'skip' | 'redo';
	type Row = { targetId: string; audioUrl: string; durationSec: number | null };
	type Item = { primary?: string; secondary?: string; badge?: string };

	let {
		rows,
		itemById,
		rowStates,
		playingItemId,
		playProgress,
		targetType,
		primaryLabel,
		secondaryLabel,
		onPlay,
		onSeek,
		onToggleKeepSkip,
		onToggleRedo,
		registerAudio
	}: {
		rows: Row[];
		itemById: Map<string, Item>;
		rowStates: Map<string, ReviewState>;
		playingItemId: string | null;
		playProgress: number;
		targetType: 'word' | 'sentence';
		primaryLabel: string;
		secondaryLabel: string;
		onPlay: (targetId: string) => void;
		onSeek: (targetId: string, fraction: number) => void;
		onToggleKeepSkip: (targetId: string) => void;
		onToggleRedo: (targetId: string) => void;
		registerAudio: (targetId: string, el: HTMLAudioElement | null) => void;
	} = $props();

	function stateOf(targetId: string): ReviewState {
		return rowStates.get(targetId) ?? 'keep';
	}
</script>

<table class="session-table" class:session-table-sentence={targetType === 'sentence'}>
	<thead>
		<tr>
			<th class="col-idx num">#</th>
			<th>{primaryLabel}</th>
			<th>{secondaryLabel}</th>
			<th>Audio</th>
			<th class="col-action">Action</th>
		</tr>
	</thead>
	<tbody>
		{#each rows as row, i (row.targetId)}
			{@const it = itemById.get(row.targetId)}
			{@const state = stateOf(row.targetId)}
			{@const seed = hashId(row.targetId)}
			{@const dur = row.durationSec ?? 0}
			{@const bars = seededWaveform(seed, 64, dur)}
			<tr
				data-row-item-id={row.targetId}
				class:playing={playingItemId === row.targetId}
				class:skip-row={state === 'skip'}
				class:redo-row={state === 'redo'}
			>
				<td class="col-idx">{String(i + 1).padStart(2, '0')}</td>
				<td class="col-word">
					{#if it?.badge}
						<span class="bulk-list-badge">{it.badge}</span>
					{/if}
					<span class="word">{it?.primary ?? row.targetId}</span>
				</td>
				<td class="col-trans">
					<span class="gloss">{it?.secondary ?? ''}</span>
				</td>
				<td class="col-audio">
					<div class="player">
						<button
							type="button"
							class="play-btn"
							class:is-playing={playingItemId === row.targetId}
							onclick={() => onPlay(row.targetId)}
							aria-label={playingItemId === row.targetId ? 'Pause' : 'Play'}
						>
							{#if playingItemId === row.targetId}
								<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
									<rect x="4" y="3" width="3" height="10" rx="1" />
									<rect x="9" y="3" width="3" height="10" rx="1" />
								</svg>
							{:else}
								<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
									<path
										d="M5 3.5v9a.5.5 0 0 0 .76.43l7-4.5a.5.5 0 0 0 0-.86l-7-4.5A.5.5 0 0 0 5 3.5z"
									/>
								</svg>
							{/if}
						</button>
						<BulkAudioWaveform
							{bars}
							playing={playingItemId === row.targetId}
							progress={playProgress}
							onSeek={(p) => onSeek(row.targetId, p)}
						/>
						<span class="timestamp">{fmtSecMs(dur)}</span>
					</div>
					<audio
						src={row.audioUrl}
						preload="metadata"
						{@attach (el) => {
							registerAudio(row.targetId, el as HTMLAudioElement);
							return () => registerAudio(row.targetId, null);
						}}
					></audio>
				</td>
				<td class="col-action">
					<div class="row-actions">
						<button
							type="button"
							class="keep-toggle"
							class:is-keep={state === 'keep'}
							onclick={() => onToggleKeepSkip(row.targetId)}
							aria-pressed={state === 'keep'}
						>
							<span class="pip">
								<svg
									viewBox="0 0 12 12"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M2 6.5l2.5 2.5L10 3.5" />
								</svg>
							</span>
							{state === 'keep' ? 'Keep' : 'Skip'}
						</button>
						<button
							type="button"
							class="redo-btn"
							class:is-on={state === 'redo'}
							onclick={() => onToggleRedo(row.targetId)}
							aria-pressed={state === 'redo'}
							title={state === 'redo' ? 'Cancel re-record' : 'Queue for re-record'}
							aria-label="Queue for re-record"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M13 4v3.5h-3.5" />
								<path d="M13 7.5A5 5 0 1 0 11.5 12" />
							</svg>
						</button>
					</div>
				</td>
			</tr>
		{/each}
	</tbody>
</table>

<style>
	.session-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 15px;
	}
	.session-table thead th {
		border-bottom: 1px solid var(--line);
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		padding: 10px 14px;
		text-align: left;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.session-table thead th.num {
		text-align: right;
	}
	.session-table tbody tr {
		border-bottom: 1px solid var(--line-soft);
		transition: background 0.12s;
	}
	.session-table tbody tr:hover {
		background: var(--surface);
	}
	.session-table tbody tr.playing {
		background: color-mix(in oklch, var(--accent-soft) 60%, transparent);
	}
	.session-table tbody tr.skip-row .col-word .word {
		color: var(--ink-mute);
		text-decoration: line-through;
		text-decoration-color: var(--ink-mute);
	}
	.session-table tbody tr.skip-row .col-trans,
	.session-table tbody tr.skip-row .player {
		opacity: 0.5;
	}
	.session-table tbody tr.redo-row {
		background: color-mix(in oklch, var(--accent-soft) 45%, transparent);
	}
	.session-table tbody td {
		padding: 14px;
		vertical-align: middle;
	}

	.col-idx {
		color: var(--ink-mute);
		font-family: var(--font-mono);
		font-size: 11px;
		text-align: right;
		width: 36px;
	}
	.col-word {
		width: 24%;
	}
	.col-word .word {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 19px;
		font-weight: 500;
		letter-spacing: -0.005em;
	}
	.col-trans {
		width: 26%;
	}
	.col-trans .gloss {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 17px;
		line-height: 1.3;
	}
	.col-audio {
		width: 42%;
	}
	.col-audio audio {
		display: none;
	}
	.player {
		align-items: center;
		display: grid;
		gap: 12px;
		grid-template-columns: auto 1fr auto;
	}
	.play-btn {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--brand);
		cursor: pointer;
		display: inline-flex;
		flex-shrink: 0;
		height: 32px;
		justify-content: center;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
		width: 32px;
	}
	.play-btn:hover {
		background: var(--brand);
		border-color: var(--brand);
		color: oklch(0.98 0.01 85);
	}
	.play-btn.is-playing {
		background: var(--accent);
		border-color: var(--accent);
		color: oklch(0.99 0.005 80);
	}
	.timestamp {
		color: var(--ink-mute);
		font-family: var(--font-mono);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.04em;
		min-width: 70px;
		text-align: right;
		white-space: nowrap;
	}

	.col-action {
		width: 200px;
	}
	.row-actions {
		align-items: center;
		display: inline-flex;
		gap: 8px;
	}
	.keep-toggle {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-soft);
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		gap: 8px;
		letter-spacing: 0.06em;
		padding: 4px 12px 4px 6px;
		text-transform: uppercase;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
	}
	.keep-toggle:hover {
		border-color: var(--ink-mute);
		color: var(--ink);
	}
	.keep-toggle .pip {
		align-items: center;
		background: var(--bg);
		border: 1.5px solid var(--ink-mute);
		border-radius: 50%;
		display: inline-flex;
		height: 16px;
		justify-content: center;
		transition:
			background 0.15s,
			border-color 0.15s;
		width: 16px;
	}
	.keep-toggle .pip svg {
		height: 10px;
		opacity: 0;
		transition: opacity 0.12s;
		width: 10px;
	}
	.keep-toggle.is-keep {
		background: var(--brand);
		border-color: var(--brand);
		color: oklch(0.98 0.01 85);
	}
	.keep-toggle.is-keep .pip {
		background: oklch(0.98 0.01 85 / 0.18);
		border-color: transparent;
	}
	.keep-toggle.is-keep .pip svg {
		color: oklch(0.98 0.01 85);
		opacity: 1;
	}
	.redo-btn {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-soft);
		cursor: pointer;
		display: inline-flex;
		height: 30px;
		justify-content: center;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
		width: 30px;
	}
	.redo-btn:hover {
		background: var(--surface);
		border-color: var(--accent);
		color: var(--accent);
	}
	.redo-btn.is-on {
		background: var(--accent);
		border-color: var(--accent);
		color: oklch(0.99 0.005 80);
	}
	/* Duplicated from BulkAudioRecorder so the row badge is styled in this
	   component's scope. The parent keeps its own copy for the active-recording
	   list, which also uses the class. */
	.bulk-list-badge {
		background: color-mix(in oklch, var(--accent) 18%, transparent);
		border: 1px solid color-mix(in oklch, var(--accent) 30%, var(--line));
		border-radius: 4px;
		color: var(--ink-soft);
		display: inline-block;
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.1em;
		margin-right: 6px;
		padding: 1px 5px;
		text-transform: uppercase;
		vertical-align: middle;
	}
</style>
