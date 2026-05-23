<script lang="ts">
	import BulkAudioReviewTable from '../../src/lib/components/BulkAudioReviewTable.svelte';

	type ReviewState = 'keep' | 'skip' | 'redo';

	let {
		rows = [
			{ targetId: 'word-1', audioUrl: '', durationSec: 1.5 },
			{ targetId: 'word-2', audioUrl: '', durationSec: 2 }
		],
		items = {
			'word-1': { primary: 'Chamge', secondary: 'good morning' },
			'word-2': { primary: 'Achobe', secondary: 'I cook', badge: 'verb' }
		},
		states = {} as Record<string, ReviewState>,
		playingItemId = null as string | null,
		playProgress = 0,
		targetType = 'word' as 'word' | 'sentence'
	}: {
		rows?: Array<{ targetId: string; audioUrl: string; durationSec: number | null }>;
		items?: Record<string, { primary?: string; secondary?: string; badge?: string }>;
		states?: Record<string, ReviewState>;
		playingItemId?: string | null;
		playProgress?: number;
		targetType?: 'word' | 'sentence';
	} = $props();

	const itemById = $derived(new Map(Object.entries(items)));
	const rowStates = $derived(new Map(Object.entries(states)));

	let log = $state<string[]>([]);
	const rec = (action: string) => (log = [...log, action]);
</script>

<BulkAudioReviewTable
	{rows}
	{itemById}
	{rowStates}
	{playingItemId}
	{playProgress}
	{targetType}
	primaryLabel="Kalenjin"
	secondaryLabel="Translation"
	onPlay={(id) => rec(`play:${id}`)}
	onSeek={(id, p) => rec(`seek:${id}:${p}`)}
	onToggleKeepSkip={(id) => rec(`keepSkip:${id}`)}
	onToggleRedo={(id) => rec(`redo:${id}`)}
	registerAudio={() => {}}
/>
<div data-testid="log">{log.join('|')}</div>
