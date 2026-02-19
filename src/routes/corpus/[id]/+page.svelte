<script lang="ts">
	let { data, form } = $props();
</script>

<section>
	<h1>Corpus sentence</h1>
	<p><a href="/corpus">Back to corpus</a></p>

	<p><strong>Kalenjin:</strong> {data.sentence.kalenjin}</p>
	<p><strong>English:</strong> {data.sentence.english}</p>
	{#if data.sentence.source}
		<p><strong>Source:</strong> {data.sentence.source}</p>
	{/if}

	{#if form?.error}
		<p class="error">{form.error}</p>
	{:else if form?.success}
		<p class="success">{form.success}</p>
	{/if}

	<h2>Token mapping</h2>
	<table>
		<thead>
			<tr>
				<th>Token</th>
				<th>Lemma link</th>
				<th>Create if missing</th>
			</tr>
		</thead>
		<tbody>
			{#each data.sentence.tokens as token}
				<tr>
					<td>
						<strong>{token.surfaceForm}</strong>
						<br />
						<small>normalized: {token.normalizedForm}</small>
					</td>
					<td>
						<form method="POST" action="?/linkToken" class="inline-form">
							<input type="hidden" name="tokenId" value={token.id} />
							<select name="wordId" required>
								<option value="">Choose dictionary word...</option>
								{#each data.words as word}
									<option value={word.id} selected={token.wordId === word.id}>
										{word.kalenjin} - {word.translations}
									</option>
								{/each}
							</select>
							<button type="submit">Link</button>
						</form>

						{#if token.word}
							<p>
								Linked: <a href={`/dictionary/${token.word.id}`}>{token.word.kalenjin}</a>
							</p>
							<form method="POST" action="?/unlinkToken">
								<input type="hidden" name="tokenId" value={token.id} />
								<button type="submit">Unlink</button>
							</form>
						{/if}
					</td>
					<td>
						<form method="POST" action="?/createWordAndLink" class="inline-form">
							<input type="hidden" name="tokenId" value={token.id} />
							<input
								name="kalenjin"
								required
								placeholder="lemma"
								value={token.word?.kalenjin ?? token.normalizedForm}
							/>
							<input name="translations" required placeholder="translations" />
							<input name="notes" placeholder="notes (optional)" />
							<button type="submit">Create + link</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>

<style>
	.error {
		color: #8c1c13;
		font-weight: 600;
	}

	.success {
		color: #1a7f37;
		font-weight: 600;
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
		vertical-align: top;
	}

	.inline-form {
		display: grid;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}

	input,
	select,
	button {
		font: inherit;
		padding: 0.4rem 0.45rem;
	}
</style>
