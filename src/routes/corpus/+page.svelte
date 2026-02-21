<script lang="ts">
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';

	let { data } = $props();
</script>

<section>
	<h1>Corpus</h1>
	<p>Search sentences and open token mapping.</p>
	<p><a href="/corpus/new">Add new corpus sentence</a></p>

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
