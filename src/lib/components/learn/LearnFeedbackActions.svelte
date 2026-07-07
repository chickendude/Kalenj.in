<script lang="ts">
	import { page } from '$app/state';
	import ClarifyDialog from '$lib/components/learn/ClarifyDialog.svelte';
	import ReportDialog from '$lib/components/ReportDialog.svelte';
	import type { ReportTargetType } from '@prisma/client';

	let {
		targetType,
		targetId,
		targetLabel
	}: {
		targetType: ReportTargetType;
		targetId: string;
		targetLabel: string;
	} = $props();

	let clarifyOpen = $state(false);
	let reportOpen = $state(false);

	// Present when the actions are rendered inside a lesson player route.
	const lessonId = $derived(page.params.lessonId ?? null);
</script>

<div class="feedback-actions">
	<button type="button" class="feedback-btn" onclick={() => (clarifyOpen = true)}>
		? Ask a question
	</button>
	<button type="button" class="feedback-btn" onclick={() => (reportOpen = true)}>
		⚑ Report an issue
	</button>
</div>

<ClarifyDialog
	open={clarifyOpen}
	{targetType}
	{targetId}
	{lessonId}
	onclose={() => (clarifyOpen = false)}
/>
<ReportDialog open={reportOpen} {targetType} {targetId} {targetLabel} onclose={() => (reportOpen = false)} />

<style>
	.feedback-actions {
		align-items: center;
		display: flex;
		gap: 0.5rem;
	}

	.feedback-btn {
		background: none;
		border: none;
		color: var(--ink-mute);
		cursor: pointer;
		font: inherit;
		font-size: 12.5px;
		padding: 0.15rem 0;
	}

	.feedback-btn:hover {
		color: var(--ink);
		text-decoration: underline;
	}
</style>
