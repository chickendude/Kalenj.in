<script lang="ts">
	import ActivityEntriesView from '../../src/lib/components/ActivityEntriesView.svelte';
	import type { ActivityEntriesData } from '../../src/lib/server/activity-entries';

	// Built here rather than passed as a prop: mount() props are serialized,
	// which would turn the Date into a string.
	const data: ActivityEntriesData = {
		targetUser: { id: 'user-1', username: 'ketton', displayName: null, role: 'MANAGER' },
		viewerIsAdmin: true,
		type: 'words',
		range: 'allTime',
		page: 1,
		pageSize: 50,
		totalCount: 1,
		proofreadCount: 0,
		entries: [
			{
				id: 'word-1',
				href: '/dictionary/teget',
				kalenjin: 'teget',
				english: 'chest',
				createdAt: new Date('2026-07-01T12:00:00Z'),
				proofreadAt: null,
				partOfSpeech: 'NOUN',
				pluralForm: null,
				incertainForm: null,
				isPluralOnly: false,
				isSingularOnly: false
			}
		]
	};
</script>

<ActivityEntriesView {data} form={null} adminView />
