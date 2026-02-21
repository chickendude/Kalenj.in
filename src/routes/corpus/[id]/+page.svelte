<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let sentenceTokens = $state([...data.sentence.tokens]);
	let dictionaryWords = $state([...data.words]);
	type CorpusWord = (typeof data.words)[number];
	let localError = $state<string | null>(null);
	let localSuccess = $state<string | null>(null);
	let creatingByTokenId = $state<Record<string, boolean>>({});

	type TokenDraft = {
		kalenjin: string;
		translations: string;
		notes: string;
	};

	let drafts = $state<Record<string, TokenDraft>>({});

	function ensureDraft(tokenId: string, defaultLemma: string): void {
		if (!drafts[tokenId]) {
			drafts[tokenId] = {
				kalenjin: defaultLemma,
				translations: '',
				notes: ''
			};
		}
	}

	function readDraft(
		tokenId: string,
		defaultLemma: string
	): {
		kalenjin: string;
		translations: string;
		notes: string;
	} {
		return drafts[tokenId] ?? { kalenjin: defaultLemma, translations: '', notes: '' };
	}

	function setDraft(
		tokenId: string,
		defaultLemma: string,
		field: keyof TokenDraft,
		value: string
	): void {
		ensureDraft(tokenId, defaultLemma);
		drafts[tokenId][field] = value;
	}

	async function createWordAndLink(tokenId: string, defaultLemma: string): Promise<void> {
		ensureDraft(tokenId, defaultLemma);
		const draft = drafts[tokenId];

		localError = null;
		localSuccess = null;
		creatingByTokenId[tokenId] = true;

		try {
			const response = await fetch(`/corpus/${data.sentence.id}/create-word-and-link`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					tokenId,
					kalenjin: draft.kalenjin,
					translations: draft.translations,
					notes: draft.notes
				})
			});

			const payload = (await response.json()) as
				| {
						error?: string;
						success?: string;
						tokenId?: string;
						createdWord?: CorpusWord;
				  }
				| undefined;

			if (!response.ok) {
				localError = payload?.error ?? 'Could not save.';
				return;
			}

			const createdWord = payload?.createdWord;
			const linkedTokenId = payload?.tokenId ?? tokenId;

			if (createdWord) {
				if (!dictionaryWords.some((word) => word.id === createdWord.id)) {
					dictionaryWords = [createdWord, ...dictionaryWords];
				}

				const token = sentenceTokens.find((item) => item.id === linkedTokenId);
				if (token) {
					token.wordId = createdWord.id;
					token.word = createdWord;
				}
			}

			localSuccess = payload?.success ?? 'Created dictionary word and linked token.';
		} catch (err) {
			console.error(err);
			localError = 'Network error while creating dictionary word.';
		} finally {
			creatingByTokenId[tokenId] = false;
		}
	}
</script>

<section>
	<h1>Corpus sentence</h1>
	<p><a href="/corpus">Back to corpus</a></p>

	<p><strong>Kalenjin:</strong> {data.sentence.kalenjin}</p>
	<p><strong>English:</strong> {data.sentence.english}</p>
	{#if data.sentence.source}
		<p><strong>Source:</strong> {data.sentence.source}</p>
	{/if}

	{#if localError}
		<p class="error">{localError}</p>
	{:else if form?.error}
		<p class="error">{form.error}</p>
	{:else if localSuccess}
		<p class="success">{localSuccess}</p>
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
			{#each sentenceTokens as token (token.id)}
				{@const defaultLemma = token.word?.kalenjin ?? token.normalizedForm}
				{@const currentDraft = readDraft(token.id, defaultLemma)}
				<tr>
					<td>
						<strong>{token.surfaceForm}</strong>
						<br />
						<small>normalized: {token.normalizedForm}</small>
					</td>
					<td>
						<form method="POST" action="?/linkToken" use:enhance class="inline-form">
							<input type="hidden" name="tokenId" value={token.id} />
							<select name="wordId" required>
								<option value="">Choose dictionary word...</option>
								{#each dictionaryWords as word}
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
							<form method="POST" action="?/unlinkToken" use:enhance>
								<input type="hidden" name="tokenId" value={token.id} />
								<button type="submit">Unlink</button>
							</form>
						{/if}
					</td>
					<td>
						<div class="inline-form">
							<input
								name="kalenjin"
								required
								placeholder="lemma"
								value={currentDraft.kalenjin}
								oninput={(event) =>
									setDraft(
										token.id,
										defaultLemma,
										'kalenjin',
										(event.currentTarget as HTMLInputElement).value
									)}
							/>
							<input
								name="translations"
								required
								placeholder="translations"
								value={currentDraft.translations}
								oninput={(event) =>
									setDraft(
										token.id,
										defaultLemma,
										'translations',
										(event.currentTarget as HTMLInputElement).value
									)}
							/>
							<input
								name="notes"
								placeholder="notes (optional)"
								value={currentDraft.notes}
								oninput={(event) =>
									setDraft(
										token.id,
										defaultLemma,
										'notes',
										(event.currentTarget as HTMLInputElement).value
									)}
							/>
							<button
								type="button"
								disabled={creatingByTokenId[token.id]}
								onclick={() => createWordAndLink(token.id, defaultLemma)}
							>
								{creatingByTokenId[token.id] ? 'Saving...' : 'Create + link'}
							</button>
						</div>
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
