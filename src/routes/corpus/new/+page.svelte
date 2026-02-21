<script lang="ts">
	let { form } = $props();
</script>

<section>
	<h1>Add corpus sentence</h1>
	<p><a href="/corpus">Back to corpus</a></p>

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
</section>

<style>
	.error {
		color: #8c1c13;
		font-weight: 600;
	}

	.editor-form {
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
</style>
