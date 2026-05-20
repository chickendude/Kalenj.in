<script lang="ts">
	import SentenceTokenAnnotations from '../../src/lib/components/SentenceTokenAnnotations.svelte';

	const tokens = [
		{
			id: 'token-1',
			tokenOrder: 0,
			surfaceForm: 'kibendi',
			normalizedForm: 'kibendi',
			wordId: 'word-1',
			inContextTranslation: '',
			word: {
				id: 'word-1',
				kalenjin: 'kibendi',
				translations: 'they went'
			}
		}
	];
</script>

<SentenceTokenAnnotations
	entityId="story-1"
	entityIdField="storyId"
	entityKind="story"
	sentenceId="sentence-1"
	sentenceText="kibendi"
	{tokens}
	dictionaryWords={[]}
	updateAction="/__ct/update"
	createAction="/__ct/create"
	searchEndpoint="/__ct/search"
	tokenGroupEndpoint="/__ct/group"
/>
