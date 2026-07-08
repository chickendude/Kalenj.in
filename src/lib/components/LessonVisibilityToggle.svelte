<script lang="ts">
	import Tooltip from '$lib/components/Tooltip.svelte';

	let {
		published,
		lessonTitle,
		disabled = false,
		onToggle
	}: {
		published: boolean;
		lessonTitle: string;
		disabled?: boolean;
		onToggle: () => void;
	} = $props();
</script>

<Tooltip label={published ? 'Visible to learners' : 'Hidden from learners'}>
	<button
		type="button"
		class="visibility-btn"
		class:published
		aria-label={published ? `Unpublish ${lessonTitle}` : `Publish ${lessonTitle}`}
		{disabled}
		onclick={onToggle}
	>
		{#if published}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
					stroke="currentColor"
					stroke-width="1.6"
				/>
				<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6" />
			</svg>
		{:else}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M4 4l16 16M9.9 6.1A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 3.9M6 8a16.5 16.5 0 0 0-3.5 4S6 18.5 12 18.5c1 0 2-.2 2.8-.5M10 10.3a3 3 0 0 0 3.9 3.9"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
				/>
			</svg>
		{/if}
	</button>
</Tooltip>

<style>
	.visibility-btn {
		align-items: center;
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 50%;
		color: var(--ink-mute);
		cursor: pointer;
		display: inline-flex;
		flex-shrink: 0;
		height: 36px;
		justify-content: center;
		transition: color 0.15s, border-color 0.15s;
		width: 36px;
	}

	.visibility-btn.published {
		border-color: color-mix(in oklab, var(--brand) 55%, var(--line));
		color: var(--brand);
	}

	.visibility-btn:hover:not(:disabled) {
		border-color: var(--brand);
		color: var(--brand);
	}

	.visibility-btn:disabled {
		cursor: default;
		opacity: 0.5;
	}
</style>
