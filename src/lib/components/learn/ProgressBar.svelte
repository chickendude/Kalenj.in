<script lang="ts">
	let { current, total }: { current: number; total: number } = $props();

	const percent = $derived(total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0);
</script>

<div
	class="lesson-progress"
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={total}
	aria-valuenow={current}
	aria-label="Lesson progress"
>
	<div class="fill" style="width: {percent}%"></div>
</div>

<style>
	.lesson-progress {
		background: color-mix(in oklab, var(--line) 60%, transparent);
		border-radius: 999px;
		height: 10px;
		overflow: hidden;
		width: 100%;
	}

	.fill {
		background: var(--brand);
		border-radius: 999px;
		height: 100%;
		transition: width 0.35s ease;
	}
</style>
