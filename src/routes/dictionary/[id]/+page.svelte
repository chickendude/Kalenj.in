<script lang="ts">
	import { PARTS_OF_SPEECH } from '$lib/parts-of-speech';

	let { data, form } = $props();
	const values = $derived(form?.values ?? data.word);
</script>

<section>
	<h1>Dictionary entry</h1>
	<p><a href="/dictionary">Back to dictionary</a></p>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{:else if form?.success}
		<p class="success">Saved changes.</p>
	{/if}

	<form method="POST" action="?/update" class="editor-form">
		<label>
			Kalenjin *
			<input name="kalenjin" required value={values.kalenjin ?? ''} />
		</label>

		<label>
			Translations (English) *
			<input
				name="translations"
				required
				value={values.translations ?? ''}
				placeholder="comma-separated translations"
			/>
		</label>

		<label>
			Notes
			<textarea name="notes" rows="3">{values.notes ?? ''}</textarea>
		</label>

		<label>
			Part of speech
			<select name="partOfSpeech" value={values.partOfSpeech ?? ''}>
				<option value="">Select...</option>
				{#each PARTS_OF_SPEECH as pos}
					<option value={pos}>{pos}</option>
				{/each}
			</select>
		</label>

		<button type="submit">Save changes</button>
	</form>

	<form method="POST" action="?/delete" class="delete-form">
		<button type="submit">Delete word</button>
	</form>

	<h2>Example sentences</h2>
	{#if data.word.sentences.length === 0}
		<p>No linked sentences yet.</p>
	{:else}
		<ul>
			{#each data.word.sentences as link}
				<li>
					<strong>{link.exampleSentence.kalenjin}</strong>
					<br />
					<small>{link.exampleSentence.english}</small>
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

	.success {
		color: #1a7f37;
		font-weight: 600;
	}

	.editor-form {
		display: grid;
		gap: 0.75rem;
		margin-bottom: 1rem;
		max-width: 620px;
	}

	label {
		display: grid;
		gap: 0.25rem;
	}

	input,
	textarea,
	select,
	button {
		font: inherit;
		padding: 0.45rem 0.5rem;
	}

	.delete-form {
		margin: 0.5rem 0 1.5rem;
	}
</style>
