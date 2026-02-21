<script lang="ts">
	let { data, form } = $props();

	type Sentence = (typeof data.sentences)[number];
	type SentenceToken = Sentence['tokens'][number];
	type SentenceWordGroup = {
		key: string;
		fullSurface: string;
		tokens: SentenceToken[];
	};

	let activeTooltipKey = $state<string | null>(null);

	function groupSentenceTokens(sentence: Sentence): SentenceWordGroup[] {
		const sorted = [...sentence.tokens].sort((a, b) => a.tokenOrder - b.tokenOrder);
		const words = sentence.kalenjin
			.trim()
			.split(/\s+/)
			.filter((word) => word.length > 0);

		const groups: SentenceWordGroup[] = [];
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
				key: `${sentence.id}:${wordIndex}:${grouped.map((token) => token.id).join(':')}`,
				fullSurface: wordSurface,
				tokens: grouped
			});
		}

		while (tokenCursor < sorted.length) {
			const token = sorted[tokenCursor];
			const wordIndex = groups.length;
			groups.push({
				key: `${sentence.id}:${wordIndex}:${token.id}`,
				fullSurface: token.surfaceForm,
				tokens: [token]
			});
			tokenCursor += 1;
		}

		return groups;
	}

	function tokenPopupLines(token: SentenceToken): string[] {
		if (!token.word) {
			return ['Not linked yet', `Token: ${token.surfaceForm}`];
		}

		return [`Kalenjin: ${token.word.kalenjin}`, `English: ${token.word.translations}`];
	}
</script>

<section>
	<h1>Corpus</h1>
	<p>Add Kalenjin sentences, translations, and link each token to dictionary entries.</p>

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

	<form method="GET" class="search-form">
		<label>
			Search sentences
			<input name="q" value={data.query} placeholder="Search Kalenjin or English..." />
		</label>
		<button type="submit">Search</button>
	</form>

	<p>{data.sentences.length} sentence(s)</p>

	{#if data.sentences.length === 0}
		<p>No sentences yet.</p>
	{:else}
		<ul class="sentence-list">
			{#each data.sentences as sentence}
				<li>
					<div class="sentence-preview" aria-label="Token preview">
						{#each groupSentenceTokens(sentence) as group (group.key)}
							<span class="word-group" aria-label={group.fullSurface}>
								{#each group.tokens as token (token.id)}
									{@const tooltipKey = `${sentence.id}:${token.id}`}
									<button
										type="button"
										class="token-part"
										class:linked={Boolean(token.word)}
										onmouseenter={() => (activeTooltipKey = tooltipKey)}
										onmouseleave={() => (activeTooltipKey = null)}
										onfocus={() => (activeTooltipKey = tooltipKey)}
										onblur={() => (activeTooltipKey = null)}
									>
										{token.surfaceForm}
										{#if activeTooltipKey === tooltipKey}
											<span class="token-tooltip" role="tooltip">
												{#each tokenPopupLines(token) as line}
													<span>{line}</span>
												{/each}
											</span>
										{/if}
									</button>
								{/each}
							</span>
						{/each}
					</div>
					<p><a href={`/corpus/${sentence.id}`}>Open token mapping</a></p>
					<br />
					<small>{sentence.english}</small>
					<br />
					<small>{sentence._count.tokens} token(s)</small>
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

	.editor-form,
	.search-form {
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

	.sentence-list {
		display: grid;
		gap: 0.75rem;
		padding: 0;
	}

	.sentence-list li {
		list-style: none;
		border-bottom: 1px solid #e2e2e2;
		padding-bottom: 0.5rem;
	}

	.sentence-preview {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.45rem;
		line-height: 1.5;
	}

	.word-group {
		display: inline-flex;
		gap: 0;
	}

	.token-part {
		background: transparent;
		border: none;
		border-radius: 0.2rem;
		cursor: help;
		font: inherit;
		margin: 0;
		padding: 0;
		position: relative;
	}

	.token-part:hover,
	.token-part:focus-visible {
		background: #e8f2ff;
		outline: none;
	}

	.token-part.linked {
		font-weight: 600;
	}

	.token-tooltip {
		background: #111827;
		border-radius: 0.45rem;
		bottom: calc(100% + 0.3rem);
		color: #f9fafb;
		display: grid;
		font-size: 0.84rem;
		gap: 0.15rem;
		left: 50%;
		min-width: 12rem;
		padding: 0.4rem 0.5rem;
		position: absolute;
		transform: translateX(-50%);
		white-space: normal;
		z-index: 10;
	}
</style>
