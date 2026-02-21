<script lang="ts">
	import { enhance } from '$app/forms';
	import TokenHoverPreview from '$lib/components/token-hover-preview.svelte';

	let { data, form } = $props();
	let sentenceTokens = $state([...data.sentence.tokens]);
	let dictionaryWords = $state([...data.words]);

	type CorpusWord = (typeof data.words)[number];
	type SentenceToken = (typeof data.sentence.tokens)[number];
	type WordGroup = {
		groupKey: string;
		wordIndex: number;
		tokens: SentenceToken[];
		fullSurface: string;
	};

	let localError = $state<string | null>(null);
	let localSuccess = $state<string | null>(null);
	let creatingByTokenId = $state<Record<string, boolean>>({});
	let splittingByTokenId = $state<Record<string, boolean>>({});
	let splitMarkersByTokenId = $state<Record<string, number[]>>({});
	let hoveredMarkerByTokenId = $state<Record<string, number | null>>({});

	type TokenDraft = {
		kalenjin: string;
		translations: string;
		notes: string;
	};

	let drafts = $state<Record<string, TokenDraft>>({});

	function wordGroups(): WordGroup[] {
		const sorted = [...sentenceTokens].sort((a, b) => a.tokenOrder - b.tokenOrder);
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

	function splitMarkers(tokenId: string): number[] {
		return splitMarkersByTokenId[tokenId] ?? [];
	}

	function hoveredMarker(tokenId: string): number | null {
		return hoveredMarkerByTokenId[tokenId] ?? null;
	}

	function toggleSplitMarker(tokenId: string, boundary: number, maxLength: number): void {
		if (boundary <= 0 || boundary >= maxLength) {
			return;
		}

		const existing = splitMarkers(tokenId);
		if (existing.includes(boundary)) {
			splitMarkersByTokenId[tokenId] = existing.filter((value) => value !== boundary);
		} else {
			splitMarkersByTokenId[tokenId] = [...existing, boundary].sort((a, b) => a - b);
		}
	}

	function setHoveredMarker(tokenId: string, boundary: number | null): void {
		hoveredMarkerByTokenId[tokenId] = boundary;
	}

	function previewSplit(surface: string, markers: number[], hover: number | null): string {
		const boundaries = [...markers];
		if (hover !== null && hover > 0 && hover < surface.length && !boundaries.includes(hover)) {
			boundaries.push(hover);
		}

		const points = boundaries.sort((a, b) => a - b);
		let output = '';
		for (let i = 0; i < surface.length; i += 1) {
			output += surface[i];
			if (points.includes(i + 1)) {
				output += '|';
			}
		}

		return output;
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

	async function applySplit(group: WordGroup): Promise<void> {
		if (group.tokens.length !== 1) {
			return;
		}

		const token = group.tokens[0];
		const points = splitMarkers(token.id);
		if (points.length === 0) {
			localError = 'Choose at least one split marker before applying split.';
			return;
		}

		localError = null;
		localSuccess = null;
		splittingByTokenId[token.id] = true;

		try {
			const response = await fetch(`/corpus/${data.sentence.id}/split-token`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					tokenId: token.id,
					splitPoints: points
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

			const index = sentenceTokens.findIndex((item) => item.id === token.id);
			if (index >= 0) {
				sentenceTokens.splice(index, 1, ...newTokens);
			}

			splitMarkersByTokenId[token.id] = [];
			hoveredMarkerByTokenId[token.id] = null;
			localSuccess = payload?.success ?? 'Token split.';
		} catch (err) {
			console.error(err);
			localError = 'Network error while splitting token.';
		} finally {
			splittingByTokenId[token.id] = false;
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
	<TokenHoverPreview sentenceId={data.sentence.id} sentenceText={data.sentence.kalenjin} tokens={sentenceTokens} />
	<table>
		<thead>
			<tr>
				<th>Word</th>
				<th>Linked lemma(s)</th>
				<th>Create/link lemmas</th>
			</tr>
		</thead>
		<tbody>
			{#each wordGroups() as group (group.groupKey)}
				<tr>
					<td>
						<strong>{group.fullSurface}</strong>
						{#if group.tokens.length === 1 && group.fullSurface.length > 1}
							{@const token = group.tokens[0]}
							<div class="word-editor">
								{#each Array.from(group.fullSurface) as char, index}
									<button
										type="button"
										class="letter-char"
										onclick={() =>
											index < group.fullSurface.length - 1
												? toggleSplitMarker(token.id, index + 1, group.fullSurface.length)
												: null}
										onmouseenter={() =>
											setHoveredMarker(
												token.id,
												index < group.fullSurface.length - 1 ? index + 1 : null
											)}
										onmouseleave={() => setHoveredMarker(token.id, null)}
									>
										{char}
									</button>
									{#if index < group.fullSurface.length - 1}
										<span
											class="marker-inline"
											class:active={splitMarkers(token.id).includes(index + 1)}
											class:hovered={hoveredMarker(token.id) === index + 1}
										>
											|
										</span>
									{/if}
								{/each}
							</div>
							<small class="preview"
								>{previewSplit(group.fullSurface, splitMarkers(token.id), hoveredMarker(token.id))}</small
							>
							<div>
								<button
									type="button"
									disabled={splittingByTokenId[token.id] || splitMarkers(token.id).length === 0}
									onclick={() => applySplit(group)}
								>
									{splittingByTokenId[token.id] ? 'Splitting...' : 'Apply split'}
								</button>
							</div>
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
							<div class="segment-block">
								<small>Part {partIndex + 1} ("{token.surfaceForm}")</small>
								<form method="POST" action="?/linkToken" use:enhance class="inline-form">
									<input type="hidden" name="tokenId" value={token.id} />
									<select name="wordId" required>
										<option value="">Choose dictionary lemma...</option>
										{#each dictionaryWords as word}
											<option value={word.id} selected={token.wordId === word.id}>
												{word.kalenjin} - {word.translations}
											</option>
										{/each}
									</select>
									<button type="submit">Link part</button>
								</form>
								{#if token.word}
									<p>
										Linked part {partIndex + 1}: <a href={`/dictionary/${token.word.id}`}
											>{token.word.kalenjin}</a
										>
									</p>
									<form method="POST" action="?/unlinkToken" use:enhance>
										<input type="hidden" name="tokenId" value={token.id} />
										<button type="submit">Unlink part</button>
									</form>
								{/if}
							</div>
						{/each}
					</td>
					<td>
						{#each group.tokens as token, partIndex}
							{@const defaultLemma = token.word?.kalenjin ?? token.normalizedForm}
							{@const currentDraft = readDraft(token.id, defaultLemma)}
							<div class="segment-block inline-form">
								<small>Create lemma for part {partIndex + 1} ("{token.surfaceForm}")</small>
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
									{creatingByTokenId[token.id] ? 'Saving...' : 'Create + link part'}
								</button>
							</div>
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

	.inline-form {
		display: grid;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}

	.segment-block {
		border-bottom: 1px dashed #ddd;
		margin-bottom: 0.6rem;
		padding-bottom: 0.6rem;
	}

	.word-editor {
		align-items: center;
		display: flex;
		margin-top: 0.4rem;
	}

	.letter-char {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		padding: 0;
	}

	.marker-inline {
		color: #bbb;
		font-weight: 700;
		margin: 0 0.1rem;
	}

	.marker-inline.active {
		color: #1a7f37;
	}

	.marker-inline.hovered {
		color: #0a66c2;
	}

	.preview {
		display: block;
		margin: 0.35rem 0;
	}

	.parts {
		margin: 0.5rem 0 0;
		padding-left: 1rem;
	}

	input,
	select,
	button {
		font: inherit;
		padding: 0.4rem 0.45rem;
	}
</style>
