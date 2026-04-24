<script lang="ts">
	import { groupSentenceTokens } from '$lib/word-groups';
	import { getSentenceTimeAnnotation } from '$lib/time-annotations';

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
		westernTime: string | null;
		timeNote: string | null;
	};

	let { sentenceId = 'sentence', tokens, onTokenClick } = $props<{
		sentenceId?: string;
		sentenceText: string;
		tokens: PreviewToken[];
		onTokenClick?: (token: PreviewToken) => void;
	}>();

	let pinnedTooltipKey = $state<string | null>(null);
	const groups = $derived(groupSentenceTokens<PreviewToken>({ sentenceId, tokens }));

	function buildPopupPart(
		key: string,
		surfaceForm: string,
		word: TokenWord | null | undefined
	): PopupPart {
		const timeAnnotation = getSentenceTimeAnnotation(surfaceForm);
		return {
			key,
			kalenjin: word?.kalenjin ?? surfaceForm,
			english: word?.translations ?? null,
			westernTime: timeAnnotation?.westernTime ?? null,
			timeNote: timeAnnotation?.note ?? null
		};
	}
</script>

{#snippet tooltipContent(popup: PopupPart)}
	<span class="token-tooltip" role="tooltip"
		><span class="tooltip-part">
			<em>{popup.kalenjin}</em>{#if popup.english}<span>{popup.english}</span>{/if}
			{#if popup.westernTime}
				<span class="time-note"><strong>Western time:</strong> {popup.westernTime}</span>
				<span class="time-note-detail">{popup.timeNote}</span>
			{/if}
		</span></span
	>
{/snippet}

<div class="sentence-preview" aria-label="Token preview">
	{#each groups as group (group.key)}
		<span class="word-group" aria-label={group.fullSurface}>
			{#each group.tokens as token (token.id)}
				{#if token.segments?.length}
					<span class="token-split" aria-label={token.surfaceForm}>
						{#each token.segments as segment (segment.id)}
							{@const tooltipKey = `${sentenceId}:${token.id}:${segment.id}`}
							{@const popup = buildPopupPart(segment.id, segment.surfaceForm, segment.word)}
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
								{segment.surfaceForm}{@render tooltipContent(popup)}
							</button>
						{/each}
					</span>
				{:else}
					{@const tooltipKey = `${sentenceId}:${token.id}`}
					{@const popup = buildPopupPart(token.id, token.surfaceForm, token.word)}
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
						{token.surfaceForm}{@render tooltipContent(popup)}
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
		background: var(--info-soft);
		outline: none;
	}

	.token-tooltip {
		display: none;
		position: absolute;
		bottom: calc(100% + 0.3rem);
		left: 50%;
		transform: translateX(-50%);
		background: var(--tooltip-bg);
		border-radius: 0.45rem;
		color: var(--tooltip-ink);
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

	.time-note {
		margin-top: 0.15rem;
	}

	.time-note-detail {
		color: color-mix(in oklab, var(--tooltip-ink) 82%, transparent);
		font-size: 0.76rem;
		line-height: 1.35;
	}

	.token-part:hover .token-tooltip,
	.token-part:focus-visible .token-tooltip,
	.token-part.pinned .token-tooltip {
		display: grid;
	}
</style>
