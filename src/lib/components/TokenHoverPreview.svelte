<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { groupSentenceTokens } from '$lib/word-groups';
	import { getSentenceTimeAnnotation } from '$lib/time-annotations';
	import { renderWordLinks } from '$lib/word-links';
	import { dictionaryEntryHref } from '$lib/word-url';

	type TokenWord = {
		id: string;
		kalenjin: string;
		slug?: string;
		translations: string;
	};

	type PreviewToken = {
		id: string;
		tokenOrder: number;
		surfaceForm: string;
		inContextTranslation?: string | null;
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
		inContextTranslation: string | null;
		westernTime: string | null;
		timeNote: string | null;
		wordId: string | null;
		wordSlug: string | null;
		hasInfo: boolean;
	};

	const TOOLTIP_VIEWPORT_GUTTER = 12;
	const OPEN_TOOLTIP_EVENT = 'kalenjin-token-preview-open';

	let { sentenceId = 'sentence', sentenceText, tokens, onTokenClick, leading } = $props<{
		sentenceId?: string;
		sentenceText: string;
		tokens: PreviewToken[];
		onTokenClick?: (token: PreviewToken) => void;
		// Optional content (e.g. a play button) rendered as the first item in the
		// wrapping flow, so wrapped lines stay flush-left instead of indenting.
		leading?: import('svelte').Snippet;
	}>();

	let pinnedTooltipKey = $state<string | null>(null);
	let activeTooltipKey = $state<string | null>(null);
	let tapPreviewMode = $state(false);
	let tooltipOffsets = $state(new Map<string, number>());
	const groups = $derived(groupSentenceTokens<PreviewToken>({ sentenceId, sentenceText, tokens }));

	onMount(() => {
		const media = window.matchMedia('(max-width: 720px), (hover: none), (pointer: coarse)');
		const sync = () => {
			tapPreviewMode = media.matches;
		};
		sync();
		media.addEventListener('change', sync);

		const handleOpenedTooltip = (event: Event) => {
			const nextKey = (event as CustomEvent<string>).detail;
			activeTooltipKey = nextKey;
			if (nextKey !== pinnedTooltipKey) {
				pinnedTooltipKey = null;
			}
		};
		window.addEventListener(OPEN_TOOLTIP_EVENT, handleOpenedTooltip);

		return () => {
			media.removeEventListener('change', sync);
			window.removeEventListener(OPEN_TOOLTIP_EVENT, handleOpenedTooltip);
		};
	});

	function buildPopupPart(
		key: string,
		surfaceForm: string,
		word: TokenWord | null | undefined,
		inContextTranslation: string | null | undefined
	): PopupPart {
		const timeAnnotation = getSentenceTimeAnnotation(surfaceForm);
		const english = word?.translations ?? null;
		const inContext = inContextTranslation?.trim() ? inContextTranslation.trim() : null;
		const westernTime = timeAnnotation?.westernTime ?? null;
		const wordId = word?.id ?? null;
		const wordSlug = word?.slug ?? null;
		return {
			key,
			kalenjin: word?.kalenjin ?? surfaceForm,
			english,
			inContextTranslation: inContext,
			westernTime,
			timeNote: timeAnnotation?.note ?? null,
			wordId,
			wordSlug,
			hasInfo: Boolean(english || inContext || westernTime || wordId)
		};
	}

	function togglePinnedTooltip(tooltipKey: string) {
		const nextKey = pinnedTooltipKey === tooltipKey ? null : tooltipKey;
		pinnedTooltipKey = nextKey;
		if (nextKey) {
			activeTooltipKey = nextKey;
			window.dispatchEvent(new CustomEvent(OPEN_TOOLTIP_EVENT, { detail: nextKey }));
		} else if (activeTooltipKey === tooltipKey) {
			activeTooltipKey = null;
		}
	}

	function placeTooltip(tooltipKey: string, element: HTMLElement) {
		const anchorRect = element.getBoundingClientRect();
		const tooltip = element.querySelector<HTMLElement>('[data-token-tooltip]');
		if (!tooltip) return;

		const tooltipRect = tooltip.getBoundingClientRect();
		const desiredLeft = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
		const maxLeft = window.innerWidth - TOOLTIP_VIEWPORT_GUTTER - tooltipRect.width;
		const clampedLeft = Math.max(
			TOOLTIP_VIEWPORT_GUTTER,
			Math.min(desiredLeft, Math.max(TOOLTIP_VIEWPORT_GUTTER, maxLeft))
		);
		const offset = Math.round(clampedLeft - desiredLeft);

		const next = new Map(tooltipOffsets);
		next.set(tooltipKey, offset);
		tooltipOffsets = next;
		void tick().then(() => correctTooltipOffset(tooltipKey, element));
	}

	function correctTooltipOffset(tooltipKey: string, element: HTMLElement) {
		const tooltip = element.querySelector<HTMLElement>('[data-token-tooltip]');
		if (!tooltip) return;

		const rect = tooltip.getBoundingClientRect();
		const rightOverflow = rect.right - (window.innerWidth - TOOLTIP_VIEWPORT_GUTTER);
		const leftOverflow = TOOLTIP_VIEWPORT_GUTTER - rect.left;
		const correction =
			rightOverflow > 0 ? -Math.ceil(rightOverflow) : leftOverflow > 0 ? Math.ceil(leftOverflow) : 0;

		if (correction === 0) return;

		const next = new Map(tooltipOffsets);
		next.set(tooltipKey, (next.get(tooltipKey) ?? 0) + correction);
		tooltipOffsets = next;
	}

	function prepareTooltip(tooltipKey: string, element: HTMLElement) {
		activeTooltipKey = tooltipKey;
		window.dispatchEvent(new CustomEvent(OPEN_TOOLTIP_EVENT, { detail: tooltipKey }));
		if (pinnedTooltipKey && pinnedTooltipKey !== tooltipKey) {
			pinnedTooltipKey = null;
		}
		void tick().then(() => placeTooltip(tooltipKey, element));
	}

	function hideTooltip(tooltipKey: string) {
		if (pinnedTooltipKey === tooltipKey) return;
		if (activeTooltipKey === tooltipKey) {
			activeTooltipKey = null;
		}
	}

	function tooltipStyleFor(tooltipKey: string): string {
		const offset = tooltipOffsets.get(tooltipKey) ?? 0;
		return `--tooltip-offset: ${offset}px`;
	}

	function openWordEntry(wordId: string, kalenjin: string, slug: string | null) {
		window.location.href = dictionaryEntryHref({ id: wordId, kalenjin, slug: slug ?? undefined });
	}

	function handleLinkedTokenClick(
		event: MouseEvent,
		tooltipKey: string,
		wordId: string,
		kalenjin: string,
		slug: string | null
	) {
		event.stopPropagation();
		const element = event.currentTarget as HTMLElement;
		if (tapPreviewMode) {
			event.preventDefault();
			togglePinnedTooltip(tooltipKey);
			void tick().then(() => placeTooltip(tooltipKey, element));
			return;
		}
		openWordEntry(wordId, kalenjin, slug);
	}

	function handleLinkedTokenKeydown(
		event: KeyboardEvent,
		tooltipKey: string,
		wordId: string,
		kalenjin: string,
		slug: string | null
	) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		event.stopPropagation();
		const element = event.currentTarget as HTMLElement;
		if (tapPreviewMode) {
			togglePinnedTooltip(tooltipKey);
			void tick().then(() => placeTooltip(tooltipKey, element));
			return;
		}
		openWordEntry(wordId, kalenjin, slug);
	}

	function handlePreviewTokenClick(event: MouseEvent, tooltipKey: string, token: PreviewToken) {
		const element = event.currentTarget as HTMLElement;
		togglePinnedTooltip(tooltipKey);
		void tick().then(() => placeTooltip(tooltipKey, element));
		onTokenClick?.(token);
	}
</script>

{#snippet tooltipContent(popup: PopupPart)}
	{#if popup.hasInfo}
		<span
			class="token-tooltip"
			class:visible={activeTooltipKey === popup.key || pinnedTooltipKey === popup.key}
			data-token-tooltip
			role="tooltip"
			style={tooltipStyleFor(popup.key)}
			class:has-entry-link={Boolean(popup.wordId && tapPreviewMode)}
			>{#if popup.wordId && tapPreviewMode}
				<a
					href={dictionaryEntryHref({
						id: popup.wordId,
						kalenjin: popup.kalenjin,
						slug: popup.wordSlug ?? undefined
					})}
					class="tooltip-entry-link"
					aria-label={`Open dictionary entry for ${popup.kalenjin}`}
					onclick={(event) => event.stopPropagation()}
				>
					<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M6 4H4.75A1.75 1.75 0 0 0 3 5.75v5.5C3 12.22 3.78 13 4.75 13h5.5A1.75 1.75 0 0 0 12 11.25V10M9 3h4v4M8 8l5-5"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</a>
			{/if}<span class="tooltip-part">
				{#if popup.inContextTranslation}
					<span class="in-context">{popup.inContextTranslation}</span>
					<span class="tooltip-divider" aria-hidden="true"></span>
				{/if}
				<span class="lemma-line"
					><em>{popup.kalenjin}</em
					>{#if popup.english}<span class="lemma-sep" aria-hidden="true">|</span><span
							><!-- eslint-disable-next-line svelte/no-at-html-tags — renderWordLinks escapes HTML -->{@html renderWordLinks(
								popup.english
							)}</span
						>{/if}</span
				>
				{#if popup.westernTime}
					<span class="time-note"><strong>Western time:</strong> {popup.westernTime}</span>
					<span class="time-note-detail">{popup.timeNote}</span>
				{/if}
			</span></span
		>
	{/if}
{/snippet}

<div class="sentence-preview" aria-label="Token preview">
	{#if leading}{@render leading()}{/if}
	{#each groups as group (group.key)}
		{#if group.breakBefore}
			<span class="speaker-break" aria-hidden="true"></span>
		{/if}
		{#if group.speakerTurn}
			<span class="speaker-marker" aria-hidden="true">—</span>
		{/if}
		<span class="word-group" aria-label={group.fullSurface}>
			{#each group.tokens as token (token.id)}
				{#if token.segments?.length}
					<span class="token-split" aria-label={token.surfaceForm}>
						{#each token.segments as segment (segment.id)}
							{@const tooltipKey = `${sentenceId}:${token.id}:${segment.id}`}
							{@const popup = buildPopupPart(
								tooltipKey,
								segment.surfaceForm,
								segment.word,
								token.inContextTranslation
							)}
							{#if popup.wordId && !onTokenClick}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<span
									class="token-part linked"
									class:pinned={pinnedTooltipKey === tooltipKey}
									role="link"
									tabindex="0"
									onpointerenter={(event) => prepareTooltip(tooltipKey, event.currentTarget)}
									onpointerleave={() => hideTooltip(tooltipKey)}
									onfocus={(event) => prepareTooltip(tooltipKey, event.currentTarget)}
									onblur={() => hideTooltip(tooltipKey)}
									onclick={(event) =>
										handleLinkedTokenClick(
											event,
											tooltipKey,
											popup.wordId!,
											popup.kalenjin,
											popup.wordSlug
										)}
									onkeydown={(event) =>
										handleLinkedTokenKeydown(
											event,
											tooltipKey,
											popup.wordId!,
											popup.kalenjin,
											popup.wordSlug
										)}
								>
									{segment.surfaceForm}{@render tooltipContent(popup)}
								</span>
							{:else}
								<button
									type="button"
									class="token-part"
									class:linked={Boolean(segment.word)}
									class:pinned={pinnedTooltipKey === tooltipKey}
									onpointerenter={(event) => prepareTooltip(tooltipKey, event.currentTarget)}
									onpointerleave={() => hideTooltip(tooltipKey)}
									onfocus={(event) => prepareTooltip(tooltipKey, event.currentTarget)}
									onblur={() => hideTooltip(tooltipKey)}
									onclick={(event) => handlePreviewTokenClick(event, tooltipKey, token)}
								>
									{segment.surfaceForm}{@render tooltipContent(popup)}
								</button>
							{/if}
						{/each}
					</span>
				{:else}
					{@const tooltipKey = `${sentenceId}:${token.id}`}
					{@const popup = buildPopupPart(
						tooltipKey,
						token.surfaceForm,
						token.word,
						token.inContextTranslation
					)}
					{#if popup.wordId && !onTokenClick}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<span
							class="token-part linked"
							class:pinned={pinnedTooltipKey === tooltipKey}
							role="link"
							tabindex="0"
							onpointerenter={(event) => prepareTooltip(tooltipKey, event.currentTarget)}
							onpointerleave={() => hideTooltip(tooltipKey)}
							onfocus={(event) => prepareTooltip(tooltipKey, event.currentTarget)}
							onblur={() => hideTooltip(tooltipKey)}
							onclick={(event) =>
								handleLinkedTokenClick(
									event,
									tooltipKey,
									popup.wordId!,
									popup.kalenjin,
									popup.wordSlug
								)}
							onkeydown={(event) =>
								handleLinkedTokenKeydown(
									event,
									tooltipKey,
									popup.wordId!,
									popup.kalenjin,
									popup.wordSlug
								)}
						>
							{token.surfaceForm}{@render tooltipContent(popup)}
						</span>
					{:else}
						<button
							type="button"
							class="token-part"
							class:linked={Boolean(token.word)}
							class:pinned={pinnedTooltipKey === tooltipKey}
							onpointerenter={(event) => prepareTooltip(tooltipKey, event.currentTarget)}
							onpointerleave={() => hideTooltip(tooltipKey)}
							onfocus={(event) => prepareTooltip(tooltipKey, event.currentTarget)}
							onblur={() => hideTooltip(tooltipKey)}
							onclick={(event) => handlePreviewTokenClick(event, tooltipKey, token)}
						>
							{token.surfaceForm}{@render tooltipContent(popup)}
						</button>
					{/if}
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

	.speaker-break {
		flex-basis: 100%;
		width: 100%;
		height: 0;
	}

	.speaker-marker {
		color: color-mix(in oklab, currentColor 55%, transparent);
		user-select: none;
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
		color: inherit;
		display: inline-block;
		font: inherit;
		letter-spacing: inherit;
		margin: 0;
		padding: 0;
		position: relative;
		text-decoration: none;
		white-space: nowrap;
		cursor: default;
	}

	.token-part.linked {
		font-weight: 600;
		cursor: pointer;
	}

	.token-part.linked::after {
		content: '';
		position: absolute;
		left: 0.15em;
		right: 0.15em;
		bottom: -0.2em;
		height: 1px;
		background-image: linear-gradient(to right, var(--accent) 1px, transparent 1px);
		background-size: 3px 1px;
		background-repeat: repeat-x;
	}

	.token-part.linked:hover,
	.token-part.linked:focus-visible {
		outline: none;
	}

	.token-part.linked:hover::after,
	.token-part.linked:focus-visible::after {
		background-image: none;
		background-color: var(--accent);
	}

	.token-tooltip {
		display: none;
		position: absolute;
		bottom: calc(100% + 0.3rem);
		left: 50%;
		margin-left: var(--tooltip-offset, 0px);
		transform: translateX(-50%);
		background: var(--tooltip-bg);
		border-radius: 0.45rem;
		color: var(--tooltip-ink);
		box-sizing: border-box;
		font-size: 0.84rem;
		gap: 0.15rem;
		max-width: min(18rem, calc(100vw - 24px));
		min-width: 12rem;
		padding: 0.4rem 0.5rem;
		white-space: normal;
		z-index: 10;
	}

	.token-tooltip.has-entry-link {
		padding-right: 1.75rem;
	}

	.tooltip-part {
		display: grid;
		gap: 0.08rem;
		text-align: center;
	}

	.in-context {
		display: block;
		text-align: center;
		font-weight: 600;
	}

	.tooltip-divider {
		display: block;
		height: 1px;
		margin: 0.3rem 0;
		background: color-mix(in oklab, var(--tooltip-ink) 25%, transparent);
	}

	.lemma-line {
		display: block;
		text-align: left;
		padding-left: 0.9rem;
		text-indent: -0.9rem;
	}

	.lemma-sep {
		margin: 0 0.3rem;
		color: color-mix(in oklab, var(--tooltip-ink) 60%, transparent);
	}

	.lemma-line :global(a) {
		color: inherit;
		text-decoration: underline;
		text-decoration-color: color-mix(in oklab, var(--tooltip-ink) 45%, transparent);
		text-underline-offset: 2px;
	}

	.lemma-line :global(a:hover) {
		text-decoration-color: currentColor;
	}

	.tooltip-entry-link {
		align-items: center;
		border-radius: 999px;
		color: inherit;
		display: inline-flex;
		height: 1.35rem;
		justify-content: center;
		position: absolute;
		right: 0.2rem;
		top: 0.2rem;
		width: 1.35rem;
	}

	.tooltip-entry-link:hover,
	.tooltip-entry-link:focus-visible {
		background: color-mix(in oklab, var(--tooltip-ink) 18%, transparent);
		outline: none;
	}

	.time-note {
		margin-top: 0.15rem;
	}

	.time-note-detail {
		color: color-mix(in oklab, var(--tooltip-ink) 82%, transparent);
		font-size: 0.76rem;
		line-height: 1.35;
	}

	.token-tooltip.visible {
		display: grid;
	}
</style>
