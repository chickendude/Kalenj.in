<script lang="ts">
	// The review-stage action bar for BulkAudioRecorder: play-all/stop, discard,
	// save, and (when there are redo items) re-record. Purely presentational —
	// all behaviour is reported via callbacks.
	let {
		playing,
		keepCount,
		redoCount,
		singular,
		plural,
		onPlayAll,
		onStop,
		onDiscard,
		onSave,
		onRerecord
	}: {
		playing: boolean;
		keepCount: number;
		redoCount: number;
		singular: string;
		plural: string;
		onPlayAll: () => void;
		onStop: () => void;
		onDiscard: () => void;
		onSave: () => void;
		onRerecord: () => void;
	} = $props();
</script>

<div class="session-actions">
	{#if playing}
		<button type="button" class="btn ghost with-icon" onclick={onStop}>
			<svg class="icn" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				<rect x="4" y="3" width="3" height="10" rx="1" />
				<rect x="9" y="3" width="3" height="10" rx="1" />
			</svg>
			Stop
		</button>
	{:else}
		<button
			type="button"
			class="btn ghost with-icon"
			onclick={onPlayAll}
			disabled={keepCount === 0}
		>
			<svg class="icn" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				<path d="M3 4v8l6-4z" />
				<path d="M9 4v8l6-4z" opacity="0.55" />
			</svg>
			Play all
		</button>
	{/if}
	<button type="button" class="btn danger with-icon" onclick={onDiscard}>
		<svg
			class="icn"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path
				d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 4.5l.7 9a1 1 0 0 0 1 .9h2.6a1 1 0 0 0 1-.9l.7-9"
			/>
		</svg>
		Discard
	</button>
	<div class="actions-spacer"></div>
	<button
		type="button"
		class="btn primary with-icon"
		onclick={onSave}
		disabled={keepCount === 0 && redoCount === 0}
	>
		<svg
			class="icn"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			stroke-width="1.7"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M3 8.5l3.5 3.5L13 5" />
		</svg>
		Save selected
		<span class="badge">{keepCount}</span>
	</button>
	{#if redoCount > 0}
		<button type="button" class="btn accent with-icon" onclick={onRerecord}>
			<svg
				width="14"
				height="14"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M13 4v3.5h-3.5" />
				<path d="M13 7.5A5 5 0 1 0 11.5 12" />
			</svg>
			Re-record {redoCount} {redoCount === 1 ? singular : plural}
		</button>
	{/if}
</div>

<style>
	.session-actions {
		align-items: center;
		border-bottom: 1px solid var(--line-soft);
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-bottom: 6px;
		padding: 14px 0;
	}
	.actions-spacer {
		flex: 1;
	}
	.session-actions .btn.with-icon {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.session-actions .btn.primary {
		background: var(--brand);
		border: 1px solid var(--brand);
		color: oklch(0.98 0.01 85);
	}
	.session-actions .btn.primary:disabled {
		cursor: not-allowed;
		filter: none;
		opacity: 0.5;
	}
	.session-actions .btn.primary .badge {
		background: oklch(0.98 0.01 85 / 0.18);
		color: oklch(0.98 0.01 85);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 600;
		padding: 1px 7px;
		border-radius: 999px;
		letter-spacing: 0.04em;
	}
	.session-actions .btn.danger {
		background: transparent;
		border: 1px solid var(--line);
		color: oklch(0.5 0.18 28);
	}
	.session-actions .btn.danger:hover {
		background: color-mix(in oklch, oklch(0.5 0.18 28) 7%, transparent);
		border-color: color-mix(in oklch, oklch(0.5 0.18 28) 45%, var(--line));
		filter: none;
	}
	.session-actions .btn.accent {
		background: var(--accent);
		border-color: var(--accent);
		color: oklch(0.99 0.005 80);
	}
	.icn {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}
</style>
