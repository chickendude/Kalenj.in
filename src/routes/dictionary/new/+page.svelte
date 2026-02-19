<script lang="ts">
	import { PARTS_OF_SPEECH } from '$lib/parts-of-speech';

	let { form } = $props();
</script>

<section>
	<h1>Add dictionary word</h1>
	<p><a href="/dictionary">Back to dictionary</a></p>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	<form method="POST" class="editor-form">
		<label>
			Kalenjin *
			<input name="kalenjin" required value={form?.values?.kalenjin ?? ''} />
		</label>

		<label>
			Translations (English) *
			<input
				name="translations"
				required
				value={form?.values?.translations ?? ''}
				placeholder="comma-separated translations"
			/>
		</label>

		<label>
			Part of speech
			<select name="partOfSpeech" value={form?.values?.partOfSpeech ?? ''}>
				<option value="">Select...</option>
				{#each PARTS_OF_SPEECH as pos}
					<option value={pos}>{pos}</option>
				{/each}
			</select>
		</label>

		<label>
			Notes
			<textarea name="notes" rows="3">{form?.values?.notes ?? ''}</textarea>
		</label>

		<button type="submit">Create word</button>
	</form>
</section>

<style>
	.error {
		color: #8c1c13;
		font-weight: 600;
	}

	.editor-form {
		display: grid;
		gap: 0.75rem;
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
</style>
