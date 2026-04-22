<script lang="ts">
	import { PARTS_OF_SPEECH, PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import WordLinkEditor from '$lib/components/WordLinkEditor.svelte';
	import type { PartOfSpeech } from '@prisma/client';

	let { form } = $props();

	let translationsValue = $state('');
	let notesValue = $state('');
	let partOfSpeechValue = $state<PartOfSpeech | ''>('');
	let pluralFormValue = $state('');
	let presentAnee = $state('');
	let presentInyee = $state('');
	let presentInee = $state('');
	let presentEchek = $state('');
	let presentOkwek = $state('');
	let presentIchek = $state('');

	$effect(() => {
		translationsValue = form?.values?.translations ?? '';
	});
	$effect(() => {
		notesValue = form?.values?.notes ?? '';
	});
	$effect(() => {
		partOfSpeechValue = (form?.values?.partOfSpeech ?? '') as PartOfSpeech | '';
	});
	$effect(() => {
		pluralFormValue = (form?.values?.pluralForm ?? '') as string;
	});

	const needsPluralInput = $derived(
		partOfSpeechValue === 'NOUN' || partOfSpeechValue === 'ADJECTIVE'
	);
	const needsConjugationInputs = $derived(partOfSpeechValue === 'VERB');
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
			<input type="text" name="kalenjin" required value={form?.values?.kalenjin ?? ''} />
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
			<select name="partOfSpeech" bind:value={partOfSpeechValue}>
				<option value="">Select...</option>
				{#each PARTS_OF_SPEECH as pos}
					<option value={pos}>{PART_OF_SPEECH_LABELS[pos]}</option>
				{/each}
			</select>
		</label>

		{#if needsPluralInput}
			<label>
				Plural
				<input
					type="text"
					name="pluralForm"
					placeholder="e.g. chego"
					bind:value={pluralFormValue}
				/>
			</label>
		{:else}
			<input type="hidden" name="pluralForm" value="" />
		{/if}

		{#if needsConjugationInputs}
			<fieldset class="conjugation-fieldset">
				<legend>Present tense</legend>
				<div class="conjugation-input-grid">
					<label>
						anee
						<input type="text" name="presentAnee" bind:value={presentAnee} />
					</label>
					<label>
						echek
						<input type="text" name="presentEchek" bind:value={presentEchek} />
					</label>
					<label>
						inyee
						<input type="text" name="presentInyee" bind:value={presentInyee} />
					</label>
					<label>
						okwek
						<input type="text" name="presentOkwek" bind:value={presentOkwek} />
					</label>
					<label>
						inee
						<input type="text" name="presentInee" bind:value={presentInee} />
					</label>
					<label>
						ichek
						<input type="text" name="presentIchek" bind:value={presentIchek} />
					</label>
				</div>
			</fieldset>
		{:else}
			<input type="hidden" name="presentAnee" value="" />
			<input type="hidden" name="presentInyee" value="" />
			<input type="hidden" name="presentInee" value="" />
			<input type="hidden" name="presentEchek" value="" />
			<input type="hidden" name="presentOkwek" value="" />
			<input type="hidden" name="presentIchek" value="" />
		{/if}

		<button type="submit">Create word</button>
	</form>
</section>

<style>
	section {
		display: block;
		margin: 0 auto;
		max-width: 640px;
	}

	.error {
		color: var(--danger);
		font-weight: 600;
	}

	.editor-form {
		display: grid;
		gap: 0.75rem;
	}

	label {
		display: grid;
		gap: 0.25rem;
	}

	input,
	select,
	button {
		font: inherit;
	}

	.conjugation-fieldset {
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 12px 14px;
	}
	.conjugation-fieldset legend {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.12em;
		padding: 0 6px;
		text-transform: uppercase;
	}
	.conjugation-input-grid {
		display: grid;
		gap: 10px 14px;
		grid-template-columns: 1fr 1fr;
	}
	@media (max-width: 640px) {
		.conjugation-input-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
