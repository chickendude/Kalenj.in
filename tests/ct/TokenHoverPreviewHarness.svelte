<script lang="ts">
	import TokenHoverPreview from '../../src/lib/components/TokenHoverPreview.svelte';

	type TokenWord = {
		id: string;
		kalenjin: string;
		slug?: string;
		translations: string;
	};

	type PreviewToken = {
		id: string;
		tokenOrder: number;
		surfaceForm: string;
		word?: TokenWord | null;
		segments?: Array<{
			id: string;
			surfaceForm: string;
			word?: TokenWord | null;
		}>;
	};

	let {
		containerStyle = '',
		sentenceId = 'playwright-sentence',
		sentenceText = '',
		tokens
	}: {
		containerStyle?: string;
		sentenceId?: string;
		sentenceText?: string;
		tokens: PreviewToken[];
	} = $props();
</script>

<div style={containerStyle}>
	<TokenHoverPreview {sentenceId} {sentenceText} {tokens} />
</div>
