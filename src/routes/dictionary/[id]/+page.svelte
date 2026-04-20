<script lang="ts">
	import { PARTS_OF_SPEECH } from '$lib/parts-of-speech';
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';
	import { parseTranslationList } from '$lib/translations';
	import type { PartOfSpeech } from '@prisma/client';

	let { data, form } = $props();

	const POS_LABELS: Record<PartOfSpeech, string> = {
		NOUN: 'Noun',
		VERB: 'Verb',
		ADJECTIVE: 'Adjective',
		ADVERB: 'Adverb',
		PRONOUN: 'Pronoun',
		PREPOSITION: 'Preposition',
		CONJUNCTION: 'Conjunction',
		INTERJECTION: 'Interjection',
		PHRASE: 'Phrase',
		OTHER: 'Other'
	};

	const values = $derived(form?.values ?? data.word);
	const alternativeSpellingsValue = $derived.by(() =>
		form?.values?.alternativeSpellings ?? data.word.spellings.map((spelling) => spelling.spelling).join('\n')
	);
	const translations = $derived(parseTranslationList(data.word.translations));
</script>

<svelte:head>
	<title>{data.word.kalenjin} — Kalenj.in</title>
</svelte:head>

<section>
	<a href="/dictionary" class="back-link">
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
			<path d="M7.5 2L3 6l4.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
		Back to dictionary
	</a>

	<div class="detail-shell">
		<div>
			<div class="entry-head">
				<div class="entry-label">Kalenjin entry</div>
				<div class="entry-title">
					<h1>{data.word.kalenjin}</h1>
				</div>
				<div class="entry-meta">
					{#if data.word.partOfSpeech}
						<span class="pos-chip">{POS_LABELS[data.word.partOfSpeech]}</span>
					{/if}
				</div>
			</div>

			<h2 class="section-title">Translations</h2>
			<ol class="translations-list">
				{#each translations as translation, index}
					<li>
						<span class="num">{index + 1}.</span>
						{translation}
					</li>
				{/each}
			</ol>

			{#if data.word.notes}
				<h2 class="section-title">Notes</h2>
				<p class="muted" style="font-size: 15px; margin: 0;">{data.word.notes}</p>
			{/if}

			<h2 class="section-title">Examples from the corpus</h2>
			{#if data.word.sentences.length === 0}
				<p class="muted" style="font-size: 15px; margin: 0;">No corpus examples yet.</p>
			{:else}
				{#each data.word.sentences as link}
					<div class="example">
						<div class="kal">
							<TokenHoverPreview
								sentenceId={link.exampleSentence.id}
								sentenceText={link.exampleSentence.kalenjin}
								tokens={link.exampleSentence.tokens}
							/>
						</div>
						<div class="en">{link.exampleSentence.english}</div>
					</div>
				{/each}
			{/if}
		</div>

		<aside>
			<div class="side-card">
				<h3>At a glance</h3>
				<table class="glance-table">
					<tbody>
						<tr>
							<td>Part of speech</td>
							<td>{data.word.partOfSpeech ? POS_LABELS[data.word.partOfSpeech] : '—'}</td>
						</tr>
						<tr>
							<td>Translations</td>
							<td>{translations.length}</td>
						</tr>
						<tr>
							<td>Examples</td>
							<td>{data.word.sentences.length}</td>
						</tr>
					</tbody>
				</table>
			</div>

			{#if data.user}
				<div class="side-card">
					<h3>Edit entry</h3>

					{#if form?.error}
						<div class="form-feedback error">{form.error}</div>
					{:else if form?.success}
						<div class="form-feedback success">Saved.</div>
					{/if}

					<form method="POST" action="?/update">
						<div class="side-field">
							<label for="kalenjin">Kalenjin</label>
							<input id="kalenjin" name="kalenjin" class="side-input" required value={values.kalenjin ?? ''} />
						</div>
						<div class="side-field">
							<label for="translations">Translations</label>
							<input
								id="translations"
								name="translations"
								class="side-input"
								required
								value={values.translations ?? ''}
								placeholder="semicolon-separated"
							/>
						</div>
						<div class="side-field">
							<label for="alternativeSpellings">Alternative spellings</label>
							<textarea
								id="alternativeSpellings"
								name="alternativeSpellings"
								class="side-textarea"
								placeholder="One spelling per line"
							>{alternativeSpellingsValue}</textarea>
						</div>
						<div class="side-field">
							<label for="partOfSpeech">Part of speech</label>
							<select id="partOfSpeech" name="partOfSpeech" class="side-select">
								<option value="">—</option>
								{#each PARTS_OF_SPEECH as pos}
									<option value={pos} selected={values.partOfSpeech === pos}>{POS_LABELS[pos]}</option>
								{/each}
							</select>
						</div>
						<div class="side-field">
							<label for="notes">Notes</label>
							<textarea id="notes" name="notes" class="side-textarea">{values.notes ?? ''}</textarea>
						</div>
						<div style="display: flex; gap: 8px; margin-top: 4px;">
							<button type="submit" class="btn-sm">Save</button>
						</div>
					</form>
				</div>

				<div class="side-card">
					<h3>Danger zone</h3>
					<form method="POST" action="?/delete">
						<button type="submit" class="btn-sm danger" style="width: 100%">Delete this entry</button>
					</form>
				</div>
			{/if}
		</aside>
	</div>
</section>
