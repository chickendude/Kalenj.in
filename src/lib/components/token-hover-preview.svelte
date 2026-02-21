<script lang="ts">
	type TokenWord = {
		kalenjin: string;
		translations: string;
	};

	type PreviewToken = {
		id: string;
		tokenOrder: number;
		surfaceForm: string;
		word?: TokenWord | null;
	};

	type WordGroup = {
		key: string;
		fullSurface: string;
		tokens: PreviewToken[];
	};

	let { sentenceId = 'sentence', sentenceText, tokens } = $props<{
		sentenceId?: string;
		sentenceText: string;
		tokens: PreviewToken[];
	}>();

	let activeTooltipKey = $state<string | null>(null);

	function wordGroups(sentence: string, sentenceTokens: PreviewToken[]): WordGroup[] {
		const sorted = [...sentenceTokens].sort((a, b) => a.tokenOrder - b.tokenOrder);
		const words = sentence
			.trim()
			.split(/\s+/)
			.filter((word) => word.length > 0);
		const groups: WordGroup[] = [];
		let tokenCursor = 0;

		for (let wordIndex = 0; wordIndex < words.length && tokenCursor < sorted.length; wordIndex += 1) {
			const wordSurface = words[wordIndex];
			const grouped: PreviewToken[] = [];
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
				key: `${sentenceId}:${wordIndex}:${grouped.map((token) => token.id).join(':')}`,
				fullSurface: wordSurface,
				tokens: grouped
			});
		}

		while (tokenCursor < sorted.length) {
			const token = sorted[tokenCursor];
			const wordIndex = groups.length;
			groups.push({
				key: `${sentenceId}:${wordIndex}:${token.id}`,
				fullSurface: token.surfaceForm,
				tokens: [token]
			});
			tokenCursor += 1;
		}

		return groups;
	}

	function tokenPopupLines(token: PreviewToken): string[] {
		if (!token.word) {
			return ['Not linked yet', `Token: ${token.surfaceForm}`];
		}

		return [`Kalenjin: ${token.word.kalenjin}`, `English: ${token.word.translations}`];
	}
</script>

<div class="sentence-preview" aria-label="Token preview">
	{#each wordGroups(sentenceText, tokens) as group (group.key)}
		<span class="word-group" aria-label={group.fullSurface}>
			{#each group.tokens as token (token.id)}
				{@const tooltipKey = `${sentenceId}:${token.id}`}
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

<style>
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
