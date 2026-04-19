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
		segments?: Array<{
			id: string;
			surfaceForm: string;
			word?: TokenWord | null;
		}>;
	};

	type PopupPart = {
		key: string;
		kalenjin: string;
		english: string | null;
	};

	let { sentenceId = 'sentence', tokens, onTokenClick } = $props<{
		sentenceId?: string;
		sentenceText: string;
		tokens: PreviewToken[];
		onTokenClick?: (token: PreviewToken) => void;
	}>();

	let pinnedTooltipKey = $state<string | null>(null);
	const groups = $derived(groupSentenceTokens<PreviewToken>({ sentenceId, tokens }));

	function tokenPopupPart(token: PreviewToken): PopupPart {
		return {
			key: token.id,
			kalenjin: token.word?.kalenjin ?? token.surfaceForm,
			english: token.word?.translations ?? null
		};
	}

	function segmentPopupPart(segment: NonNullable<PreviewToken['segments']>[number]): PopupPart {
		return {
			key: segment.id,
			kalenjin: segment.word?.kalenjin ?? segment.surfaceForm,
			english: segment.word?.translations ?? null
		};
	}
</script>

<div class="sentence-preview" aria-label="Token preview">
	{#each groups as group (group.key)}
		<span class="word-group" aria-label={group.fullSurface}>
			{#each group.tokens as token (token.id)}
				{#if token.segments?.length}
					<span class="token-split" aria-label={token.surfaceForm}>
						{#each token.segments as segment (segment.id)}
							{@const tooltipKey = `${sentenceId}:${token.id}:${segment.id}`}
							{@const popup = segmentPopupPart(segment)}
							<button
								type="button"
								class="token-part"
								class:linked={Boolean(segment.word)}
								class:pinned={pinnedTooltipKey === tooltipKey}
								onclick={() => {
									pinnedTooltipKey = pinnedTooltipKey === tooltipKey ? null : tooltipKey;
									onTokenClick?.(token);
								}}
							>
								{segment.surfaceForm}<span class="token-tooltip" role="tooltip"
									><span class="tooltip-part">
										<em>{popup.kalenjin}</em>{#if popup.english}<span>{popup.english}</span>{/if}
									</span></span
								>
							</button>
						{/each}
					</span>
				{:else}
					{@const tooltipKey = `${sentenceId}:${token.id}`}
					{@const popup = tokenPopupPart(token)}
					<button
						type="button"
						class="token-part"
						class:linked={Boolean(token.word)}
						class:pinned={pinnedTooltipKey === tooltipKey}
						onclick={() => {
							pinnedTooltipKey = pinnedTooltipKey === tooltipKey ? null : tooltipKey;
							onTokenClick?.(token);
						}}
					>
						{token.surfaceForm}<span class="token-tooltip" role="tooltip"
							><span class="tooltip-part">
								<em>{popup.kalenjin}</em>{#if popup.english}<span>{popup.english}</span>{/if}
							</span></span
						>
					</button>
				{/if}
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
		display: flex;
		gap: 0;
	}

	.token-split {
		display: inline-flex;
		gap: 0;
		white-space: nowrap;
	}

	.token-part {
		background: transparent;
		border: none;
		border-radius: 0.2rem;
		font: inherit;
		letter-spacing: inherit;
		margin: 0;
		padding: 0;
		position: relative;
		white-space: nowrap;
		cursor: default;
	}

	.token-part.linked {
		font-weight: 600;
		cursor: pointer;
	}

	.token-part:hover,
	.token-part:focus-visible {
		background: #e8f2ff;
		outline: none;
	}

	.token-tooltip {
		display: none;
		position: absolute;
		bottom: calc(100% + 0.3rem);
		left: 50%;
		transform: translateX(-50%);
		background: #111827;
		border-radius: 0.45rem;
		color: #f9fafb;
		font-size: 0.84rem;
		gap: 0.15rem;
		min-width: 12rem;
		padding: 0.4rem 0.5rem;
		white-space: normal;
		z-index: 10;
	}

	.tooltip-part {
		display: grid;
		gap: 0.08rem;
	}

	.token-part:hover .token-tooltip,
	.token-part:focus-visible .token-tooltip,
	.token-part.pinned .token-tooltip {
		display: grid;
	}
</style>
