<script lang="ts">
	import CorpusSentencePage from '../../src/routes/corpus/[id]/+page.svelte';
	import { createEditMode } from '../../src/lib/stores/editMode.svelte';

	createEditMode(true);

	const data = {
		editMode: true,
		user: {
			id: 'user-1',
			username: 'editor',
			displayName: null,
			role: 'ADMIN' as const,
			themePreference: 'auto' as const,
			statsFilterPreference: null
		},
		sentence: {
			id: 'sentence-1',
			kalenjin: 'U ya metit en komet rani.',
			english: '',
			notes: "It's like your mother's head is bad today.",
			isUnique: false,
			status: 'NEEDS_PROOFREAD' as const,
			lemmaProofreadAt: null,
			imageUrl: null,
			audioUrl: null,
			audioRecordedById: null,
			audioRecordedAt: null,
			createdAt: new Date('2026-06-05T00:00:00.000Z'),
			updatedAt: new Date('2026-06-05T00:00:00.000Z'),
			tokens: [],
			storyLinks: []
		},
		words: [],
		ignoredNormalizedForms: []
	};
</script>

<CorpusSentencePage {data} form={null} />
