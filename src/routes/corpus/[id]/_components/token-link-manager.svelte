<script lang="ts">
	import { enhance } from '$app/forms';

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

	let { token, partIndex, dictionaryWords } = $props<{
		token: LinkableToken;
		partIndex: number;
		dictionaryWords: DictionaryWord[];
	}>();
</script>

<div class="segment-block">
	<small>Part {partIndex + 1} ("{token.surfaceForm}")</small>
	<form method="POST" action="?/linkToken" use:enhance class="inline-form">
		<input type="hidden" name="tokenId" value={token.id} />
		<select name="wordId" required>
			<option value="">Choose dictionary lemma...</option>
			{#each dictionaryWords as word}
				<option value={word.id} selected={token.wordId === word.id}>
					{word.kalenjin} - {word.translations}
				</option>
			{/each}
		</select>
		<button type="submit">Link part</button>
	</form>
	{#if token.word}
		<p>
			Linked part {partIndex + 1}: <a href={`/dictionary/${token.word.id}`}>{token.word.kalenjin}</a>
		</p>
		<form method="POST" action="?/unlinkToken" use:enhance>
			<input type="hidden" name="tokenId" value={token.id} />
			<button type="submit">Unlink part</button>
		</form>
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

	input,
	select,
	button {
		font: inherit;
		padding: 0.4rem 0.45rem;
	}
</style>
