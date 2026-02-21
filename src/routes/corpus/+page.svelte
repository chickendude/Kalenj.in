<script lang="ts">
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';

	let { data, form } = $props();
</script>

<section>
	<h1>Corpus</h1>
	<p>Add Kalenjin sentences, translations, and link each token to dictionary entries.</p>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	<form method="POST" action="?/createSentence" class="editor-form">
		<label>
			Kalenjin sentence *
			<textarea name="kalenjin" rows="3" required>{form?.values?.kalenjin ?? ''}</textarea>
		</label>

		<label>
			English translation *
			<textarea name="english" rows="3" required>{form?.values?.english ?? ''}</textarea>
		</label>

		<label>
			Source (optional)
			<input name="source" value={form?.values?.source ?? ''} />
		</label>

		<button type="submit">Create sentence and tokens</button>
	</form>

	<form method="GET" class="search-form">
		<label>
			Search sentences
			<input name="q" value={data.query} placeholder="Search Kalenjin or English..." />
		</label>
		<button type="submit">Search</button>
	</form>

	<p>{data.sentences.length} sentence(s)</p>

	{#if data.sentences.length === 0}
		<p>No sentences yet.</p>
	{:else}
		<ul class="sentence-list">
			{#each data.sentences as sentence}
				<li>
					<TokenHoverPreview
						sentenceId={sentence.id}
						sentenceText={sentence.kalenjin}
						tokens={sentence.tokens}
					/>
					<p><a href={`/corpus/${sentence.id}`}>Open token mapping</a></p>
					<br />
					<small>{sentence.english}</small>
					<br />
					<small>{sentence._count.tokens} token(s)</small>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.error {
		color: #8c1c13;
		font-weight: 600;
	}

	.editor-form,
	.search-form {
		display: grid;
		gap: 0.75rem;
		margin: 1rem 0;
		max-width: 720px;
	}

	label {
		display: grid;
		gap: 0.25rem;
	}

	input,
	textarea,
	button {
		font: inherit;
		padding: 0.45rem 0.5rem;
	}

	.sentence-list {
		display: grid;
		gap: 0.75rem;
		padding: 0;
	}

	.sentence-list li {
		list-style: none;
		border-bottom: 1px solid #e2e2e2;
		padding-bottom: 0.5rem;
	}
</style>
