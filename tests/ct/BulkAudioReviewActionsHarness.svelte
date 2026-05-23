<script lang="ts">
	import BulkAudioReviewActions from '../../src/lib/components/BulkAudioReviewActions.svelte';

	let {
		playing = false,
		keepCount = 2,
		redoCount = 0
	}: {
		playing?: boolean;
		keepCount?: number;
		redoCount?: number;
	} = $props();

	let log = $state<string[]>([]);
	const rec = (action: string) => (log = [...log, action]);
</script>

<BulkAudioReviewActions
	{playing}
	{keepCount}
	{redoCount}
	singular="word"
	plural="words"
	onPlayAll={() => rec('playAll')}
	onStop={() => rec('stop')}
	onDiscard={() => rec('discard')}
	onSave={() => rec('save')}
	onRerecord={() => rec('rerecord')}
/>
<div data-testid="log">{log.join(',')}</div>
