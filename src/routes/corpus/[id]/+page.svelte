<script lang="ts">
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';
	import TokenCreateLemmaForm from './_components/token-create-lemma-form.svelte';
	import TokenLinkManager from './_components/token-link-manager.svelte';
	import WordSplitEditor from './_components/word-split-editor.svelte';

	let { data } = $props();

	/** Dictionary word shape available to this page from the server load payload. */
	type CorpusWord = (typeof data.words)[number];
	/** Token row for the current sentence, including optional linked dictionary word info. */
	type SentenceToken = (typeof data.sentence.tokens)[number];
	/**
	 * Display-oriented grouping of one sentence word and the token segment(s) that compose it.
	 * Used by the token mapping table.
	 */
	type WordGroup = {
		/** Stable key for `{#each}` rendering. */
		groupKey: string;
		/** Zero-based index of the word within the sentence text. */
		wordIndex: number;
		/**
		 * Token segment(s) that compose this displayed word.
		 * Each token keeps its own `surfaceForm`: the exact text seen in the sentence.
		 */
		tokens: SentenceToken[];
		/**
		 * Full surface form for the grouped word: the exact original spelling in the sentence,
		 * before normalization or lemma linking.
		 */
		fullSurface: string;
	};

	let localError = $state<string | null>(null);
	let localSuccess = $state<string | null>(null);
	let creatingByTokenId = $state<Record<string, boolean>>({});
	let linkingByTokenId = $state<Record<string, boolean>>({});
	let splittingByTokenId = $state<Record<string, boolean>>({});

	/** Unsaved per-token create-lemma form values keyed by token id in `drafts`. */
	type TokenDraft = {
		/** Lemma text that will be saved to the dictionary. */
		kalenjin: string;
		/** Comma-separated or freeform English translations entered by the user. */
		translations: string;
		/** Optional notes for the new dictionary entry. */
		notes: string;
	};

	let sentenceTokens = $state<SentenceToken[]>([]);
	let dictionaryWords = $state<CorpusWord[]>([]);
	let localSnapshotSentenceId = $state<string | null>(null);
	const displayedSentenceTokens = $derived(
		localSnapshotSentenceId === data.sentence.id ? sentenceTokens : data.sentence.tokens
	);
	const displayedDictionaryWords = $derived(
		localSnapshotSentenceId === data.sentence.id ? dictionaryWords : data.words
	);

	let drafts = $state<Record<string, TokenDraft>>({});
	let previousSentenceId: string | null = null;

	$effect(() => {
		const nextSentenceId = data.sentence.id;
		const sentenceChanged = previousSentenceId !== nextSentenceId;
		previousSentenceId = nextSentenceId;

		localSnapshotSentenceId = nextSentenceId;
		sentenceTokens = [...data.sentence.tokens];
		dictionaryWords = [...data.words];

		if (sentenceChanged) {
			drafts = {};
			creatingByTokenId = {};
			linkingByTokenId = {};
			splittingByTokenId = {};
			localError = null;
			localSuccess = null;
		}
	});

	function ensureLocalSnapshotsReady(): void {
		if (localSnapshotSentenceId === data.sentence.id) {
			return;
		}

		localSnapshotSentenceId = data.sentence.id;
		sentenceTokens = [...data.sentence.tokens];
		dictionaryWords = [...data.words];
	}

	function wordGroups(tokens: SentenceToken[]): WordGroup[] {
		const sorted = [...tokens].sort((a, b) => a.tokenOrder - b.tokenOrder);
		const words = data.sentence.kalenjin
			.trim()
			.split(/\s+/)
			.filter((word) => word.length > 0);
		const groups: WordGroup[] = [];
		let tokenCursor = 0;

		for (let wordIndex = 0; wordIndex < words.length && tokenCursor < sorted.length; wordIndex += 1) {
			const wordSurface = words[wordIndex];
			const grouped: SentenceToken[] = [];
			let combined = '';

			while (tokenCursor < sorted.length && combined.length < wordSurface.length) {
				const token = sorted[tokenCursor];
				grouped.push(token);
				combined += token.surfaceForm;
				tokenCursor += 1;
			}

			if (grouped.length === 0) {
				continue;
			}

			groups.push({
				groupKey: `${wordIndex}:${grouped.map((item) => item.id).join(':')}`,
				wordIndex,
				tokens: grouped,
				fullSurface: wordSurface
			});
		}

		while (tokenCursor < sorted.length) {
			const token = sorted[tokenCursor];
			const wordIndex = groups.length;
			groups.push({
				groupKey: `${wordIndex}:${token.id}`,
				wordIndex,
				tokens: [token],
				fullSurface: token.surfaceForm
			});
			tokenCursor += 1;
		}

		if (groups.length === 0) {
			return sorted.map((token, wordIndex) => ({
				groupKey: `${wordIndex}:${token.id}`,
				wordIndex,
				tokens: [token],
				fullSurface: token.surfaceForm
			}));
		}

		return groups;
	}

	function ensureDraft(tokenId: string, defaultLemma: string): void {
		if (!drafts[tokenId]) {
			drafts[tokenId] = {
				kalenjin: defaultLemma,
				translations: '',
				notes: ''
			};
		}
	}

	function readDraft(tokenId: string, defaultLemma: string): TokenDraft {
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

	async function linkToken(tokenId: string, wordId: string): Promise<void> {
		ensureLocalSnapshotsReady();
		localError = null;
		localSuccess = null;
		linkingByTokenId[tokenId] = true;

		try {
			const response = await fetch(`/corpus/${data.sentence.id}/link-token`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ tokenId, wordId })
			});

			const payload = (await response.json()) as
				| {
						error?: string;
						success?: string;
						tokenId?: string;
						linkedWord?: CorpusWord;
				  }
				| undefined;

			if (!response.ok) {
				localError = payload?.error ?? 'Could not link token.';
				return;
			}

			const linkedTokenId = payload?.tokenId ?? tokenId;
			const linkedWord =
				payload?.linkedWord ?? dictionaryWords.find((candidate) => candidate.id === wordId) ?? null;
			if (!linkedWord) {
				localError = 'Linked word could not be found.';
				return;
			}

			if (!dictionaryWords.some((word) => word.id === linkedWord.id)) {
				dictionaryWords = [linkedWord, ...dictionaryWords];
			}

			const token = sentenceTokens.find((item) => item.id === linkedTokenId);
			if (token) {
				token.wordId = linkedWord.id;
				token.word = linkedWord;
			}

			localSuccess = payload?.success ?? 'Token linked.';
		} catch (err) {
			console.error(err);
			localError = 'Network error while linking token.';
		} finally {
			linkingByTokenId[tokenId] = false;
		}
	}

	async function unlinkToken(tokenId: string): Promise<void> {
		ensureLocalSnapshotsReady();
		localError = null;
		localSuccess = null;
		linkingByTokenId[tokenId] = true;

		try {
			const response = await fetch(`/corpus/${data.sentence.id}/unlink-token`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ tokenId })
			});

			const payload = (await response.json()) as
				| {
						error?: string;
						success?: string;
						tokenId?: string;
				  }
				| undefined;

			if (!response.ok) {
				localError = payload?.error ?? 'Could not unlink token.';
				return;
			}

			const linkedTokenId = payload?.tokenId ?? tokenId;
			const token = sentenceTokens.find((item) => item.id === linkedTokenId);
			if (token) {
				token.wordId = null;
				token.word = null;
			}

			localSuccess = payload?.success ?? 'Token unlinked.';
		} catch (err) {
			console.error(err);
			localError = 'Network error while unlinking token.';
		} finally {
			linkingByTokenId[tokenId] = false;
		}
	}

	async function createWordAndLink(tokenId: string, defaultLemma: string): Promise<void> {
		ensureLocalSnapshotsReady();
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

	async function applySplit(tokenId: string, splitPoints: number[]): Promise<void> {
		ensureLocalSnapshotsReady();
		localError = null;
		localSuccess = null;
		splittingByTokenId[tokenId] = true;

		try {
			const response = await fetch(`/corpus/${data.sentence.id}/split-token`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					tokenId,
					splitPoints
				})
			});

			const payload = (await response.json()) as
				| {
						error?: string;
						success?: string;
						tokenId?: string;
						tokens?: SentenceToken[];
				  }
				| undefined;

			if (!response.ok) {
				localError = payload?.error ?? 'Could not split token.';
				return;
			}

			const newTokens = payload?.tokens ?? [];
			if (newTokens.length < 2) {
				localError = 'Split response was incomplete.';
				return;
			}

				const index = sentenceTokens.findIndex((item) => item.id === tokenId);
				if (index >= 0) {
					sentenceTokens.splice(index, 1, ...newTokens);
				}

				localSuccess = payload?.success ?? 'Token split.';
			} catch (err) {
				console.error(err);
				localError = 'Network error while splitting token.';
			} finally {
				splittingByTokenId[tokenId] = false;
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
	{:else if localSuccess}
		<p class="success">{localSuccess}</p>
	{/if}

	<h2>Token mapping</h2>
	<TokenHoverPreview
		sentenceId={data.sentence.id}
		sentenceText={data.sentence.kalenjin}
		tokens={displayedSentenceTokens}
	/>
	<table>
		<thead>
			<tr>
				<th>Word</th>
				<th>Linked lemma(s)</th>
				<th>Create/link lemmas</th>
			</tr>
		</thead>
		<tbody>
			{#each wordGroups(displayedSentenceTokens) as group (group.groupKey)}
				<tr>
						<td>
							<strong>{group.fullSurface}</strong>
								{#if group.tokens.length === 1 && group.fullSurface.length > 1}
									{@const token = group.tokens[0]}
								<WordSplitEditor
									tokenId={token.id}
									surface={group.fullSurface}
									splitting={Boolean(splittingByTokenId[token.id])}
									onApplySplit={applySplit}
								/>
								{:else}
									<ul class="parts">
										{#each group.tokens as token, partIndex}
										<li>Part {partIndex + 1}: "{token.surfaceForm}"</li>
									{/each}
								</ul>
							{/if}
						</td>
						<td>
							{#each group.tokens as token, partIndex}
								<TokenLinkManager
									{token}
									{partIndex}
									dictionaryWords={displayedDictionaryWords}
									linking={Boolean(linkingByTokenId[token.id])}
									onLinkToken={linkToken}
									onUnlinkToken={unlinkToken}
								/>
							{/each}
						</td>
					<td>
						{#each group.tokens as token, partIndex}
							{@const defaultLemma = token.word?.kalenjin ?? token.normalizedForm}
							{@const currentDraft = readDraft(token.id, defaultLemma)}
							<TokenCreateLemmaForm
								{token}
								{partIndex}
								{defaultLemma}
								draft={currentDraft}
								creating={Boolean(creatingByTokenId[token.id])}
								onDraftChange={setDraft}
								onCreate={createWordAndLink}
							/>
						{/each}
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

	.parts {
		margin: 0.5rem 0 0;
		padding-left: 1rem;
	}

</style>
