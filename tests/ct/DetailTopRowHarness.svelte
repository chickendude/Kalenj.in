<script lang="ts">
	import BackLink from '../../src/lib/components/BackLink.svelte';
</script>

<div class="detail-row-samples">
	<div class="detail-top-row" data-testid="dictionary-row">
		<BackLink href="/dictionary" label="Back to dictionary" />
		<div class="detail-actions">
			<button type="button" class="icon-action-btn" aria-label="Report an issue">!</button>
			<button type="button" class="icon-action-btn" aria-label="Edit mode">E</button>
		</div>
	</div>

	<div class="detail-top-row" data-testid="corpus-row">
		<div class="entry-nav-meta">
			<BackLink href="/corpus" label="Back to corpus" />
			<div class="entry-label">Corpus sentence</div>
		</div>
		<div class="detail-actions">
			<button type="button" class="icon-action-btn" aria-label="Report an issue">!</button>
		</div>
	</div>
</div>

<style>
	.detail-row-samples {
		display: grid;
		gap: 48px;
		width: 640px;
	}

	.detail-actions,
	.entry-nav-meta {
		display: grid;
		gap: 0.2rem;
	}

	.detail-actions {
		display: flex;
		gap: 8px;
	}
</style>
