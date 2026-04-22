<script lang="ts">
	import { PARTS_OF_SPEECH } from '$lib/parts-of-speech';
	import WordLinkEditor from '$lib/components/WordLinkEditor.svelte';

	let { form } = $props();

	let translationsValue = $state('');
	let notesValue = $state('');
	$effect(() => {
		translationsValue = form?.values?.translations ?? '';
	});
	$effect(() => {
		notesValue = form?.values?.notes ?? '';
	});
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
			<WordLinkEditor
				name="translations"
				required
				placeholder="semicolon-separated translations"
				bind:value={translationsValue}
			/>
		</label>

		<label>
			Alternative spellings
			<input
				type="text"
				name="alternativeSpellings"
				placeholder="Comma-separated"
				value={form?.values?.alternativeSpellings ?? ''}
			/>
		</label>

		<label>
			Notes
			<WordLinkEditor name="notes" multiline rows={3} bind:value={notesValue} />
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

		<button type="submit">Create word</button>
	</form>
</section>

<style>
	.error {
		color: var(--danger);
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
	select,
	button {
		font: inherit;
		padding: 0.45rem 0.5rem;
	}
</style>
