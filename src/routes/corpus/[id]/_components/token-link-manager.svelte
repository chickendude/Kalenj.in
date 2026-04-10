<script lang="ts">
	type DictionaryWord = {
		id: string;
		kalenjin: string;
		translations: string;
	};

	type LinkedWord = {
		id: string;
		kalenjin: string;
	};

	type LinkableToken = {
		id: string;
		surfaceForm: string;
		wordId: string | null;
		word?: LinkedWord | null;
	};

	type Props = {
		token: LinkableToken;
		partIndex: number;
		dictionaryWords: DictionaryWord[];
		linking?: boolean;
		onLinkToken: (tokenId: string, wordId: string) => Promise<void> | void;
		onUnlinkToken: (tokenId: string) => Promise<void> | void;
	};

	let {
		token,
		partIndex,
		dictionaryWords,
		linking = false,
		onLinkToken,
		onUnlinkToken
	}: Props = $props();

	let selectedWordId = $state('');

	$effect(() => {
		token.wordId;
		selectedWordId = token.wordId ?? '';
	});

	async function linkPart(): Promise<void> {
		const wordId = selectedWordId.trim();
		if (!wordId || linking) {
			return;
		}

		await onLinkToken(token.id, wordId);
	}

	async function unlinkPart(): Promise<void> {
		if (linking) {
			return;
		}

		await onUnlinkToken(token.id);
	}
</script>

<div class="segment-block">
	<small>Part {partIndex + 1} ("{token.surfaceForm}")</small>
	<div class="inline-form">
		<select bind:value={selectedWordId} required disabled={linking}>
			<option value="">Choose dictionary lemma...</option>
			{#each dictionaryWords as word}
				<option value={word.id}>{word.kalenjin} - {word.translations}</option>
			{/each}
		</select>
		<button type="button" disabled={linking || !selectedWordId} onclick={linkPart}>
			{linking ? 'Saving...' : 'Link part'}
		</button>
	</div>
	{#if token.word}
		<p>
			Linked part {partIndex + 1}: <a href={`/dictionary/${token.word.id}`}>{token.word.kalenjin}</a>
		</p>
		<button type="button" disabled={linking} onclick={unlinkPart}>
			{linking ? 'Saving...' : 'Unlink part'}
		</button>
	{/if}
</div>

<style>
	.inline-form {
		display: grid;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}

	.segment-block {
		border-bottom: 1px dashed #ddd;
		margin-bottom: 0.6rem;
		padding-bottom: 0.6rem;
	}

	select,
	button {
		font: inherit;
		padding: 0.4rem 0.45rem;
	}
</style>
