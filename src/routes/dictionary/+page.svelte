<script lang="ts">
	let { data } = $props();
</script>

<section>
	<h1>Dictionary</h1>
	<p><a href="/dictionary/new">Add new word</a></p>

	<form method="GET" class="search-form">
		<label>
			Search
			<input name="q" value={data.query} placeholder="Search words..." />
		</label>

		<label>
			Language
			<select name="lang" value={data.language}>
				<option value="both">English + Kalenjin</option>
				<option value="english">English</option>
				<option value="kalenjin">Kalenjin</option>
			</select>
		</label>

		<button type="submit">Search</button>
	</form>

	<p>{data.words.length} result(s)</p>

	{#if data.words.length === 0}
		<p>No words found.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Kalenjin</th>
					<th>Translations (English)</th>
					<th>Part of speech</th>
				</tr>
			</thead>
			<tbody>
				{#each data.words as word}
					<tr>
						<td><a href={`/dictionary/${word.id}`}>{word.kalenjin}</a></td>
						<td>{word.translations}</td>
						<td>{word.partOfSpeech ?? '-'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.search-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 1rem 0;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	input,
	select,
	button {
		font: inherit;
		padding: 0.45rem 0.5rem;
	}

	table {
		border-collapse: collapse;
		width: 100%;
	}

	th,
	td {
		border-bottom: 1px solid #e2e2e2;
		padding: 0.5rem;
		text-align: left;
	}
</style>
