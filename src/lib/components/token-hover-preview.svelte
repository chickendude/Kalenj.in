<script lang="ts">
	import { groupSentenceTokens } from '$lib/word-groups';

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

	let { sentenceId = 'sentence', sentenceText, tokens } = $props<{
		sentenceId?: string;
		sentenceText: string;
		tokens: PreviewToken[];
	}>();

	let activeTooltipKey = $state<string | null>(null);
	const groups = $derived(groupSentenceTokens<PreviewToken>({ sentenceId, tokens }));

	function tokenPopup(token: PreviewToken): { kalenjin: string; english: string | null } {
		if (!token.word) {
			return { kalenjin: token.surfaceForm, english: null };
		}

		return { kalenjin: token.word.kalenjin, english: token.word.translations };
	}
</script>

<div class="sentence-preview" aria-label="Token preview">
	{#each groups as group (group.key)}
		<span class="word-group" aria-label={group.fullSurface}>
			{#each group.tokens as token (token.id)}
				{@const tooltipKey = `${sentenceId}:${token.id}`}
				{@const popup = tokenPopup(token)}
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
							<em>{popup.kalenjin}</em>
							{#if popup.english}
								<span>{popup.english}</span>
							{/if}
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
