<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { groupSentenceTokens } from '$lib/word-groups';
	import { getSentenceTimeAnnotation } from '$lib/time-annotations';
	import { parseTranslationList } from '$lib/translations';
	import { renderWordLinks } from '$lib/word-links';
	import { dictionaryEntryHref } from '$lib/word-url';

	type TokenWord = {
		id: string;
		kalenjin: string;
		slug?: string;
		translations: string;
	};

	type PreviewCompound = {
		id: string;
		inContextTranslation?: string | null;
		word?: TokenWord | null;
	};

	type PreviewToken = {
		id: string;
		tokenOrder: number;
		surfaceForm: string;
		inContextTranslation?: string | null;
		word?: TokenWord | null;
		compound?: PreviewCompound | null;
		segments?: Array<{
			id: string;
			surfaceForm: string;
			word?: TokenWord | null;
		}>;
	};

	type PopupEntry = {
		kalenjin: string;
		definitions: string[];
		wordId: string;
		wordSlug: string | null;
	};

	type PopupSection = {
		key: string;
		inContextTranslation: string | null;
		entry: PopupEntry | null;
	};

	type PopupPart = {
		key: string;
		kalenjin: string;
		sections: PopupSection[];
		westernTime: string | null;
		timeNote: string | null;
		wordId: string | null;
		wordSlug: string | null;
		hasInfo: boolean;
	};

	const TOOLTIP_VIEWPORT_GUTTER = 16;
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
	let tooltipPlacements = $state(new Map<string, 'above' | 'below'>());
	let hideTooltipTimer: ReturnType<typeof setTimeout> | null = null;
	const groups = $derived(groupSentenceTokens<PreviewToken>({ sentenceId, sentenceText, tokens }));
	// Members followed by another member of the same compound stretch their
	// underline across the gap so the phrase reads as one unit.
	const compoundContinuations = $derived.by(() => {
		const flat = groups.flatMap((group) => group.tokens);
		const ids = new Set<string>();
		for (let index = 0; index < flat.length - 1; index += 1) {
			const compoundId = flat[index].compound?.id;
			if (compoundId && flat[index + 1].compound?.id === compoundId) {
				ids.add(flat[index].id);
			}
		}
		return ids;
	});

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
			if (hideTooltipTimer) clearTimeout(hideTooltipTimer);
			media.removeEventListener('change', sync);
			window.removeEventListener(OPEN_TOOLTIP_EVENT, handleOpenedTooltip);
		};
	});

	function popupEntry(word: TokenWord | null | undefined): PopupEntry | null {
		if (!word) return null;
		return {
			kalenjin: word.kalenjin,
			definitions: parseTranslationList(word.translations),
			wordId: word.id,
			wordSlug: word.slug ?? null
		};
	}

	function buildPopupPart(
		key: string,
		surfaceForm: string,
		word: TokenWord | null | undefined,
		inContextTranslation: string | null | undefined,
		compound: PreviewCompound | null | undefined = null
	): PopupPart {
		const timeAnnotation = getSentenceTimeAnnotation(surfaceForm);
		// One section for the word itself, then one for the phrase it belongs
		// to — each with its own contextual translation and entry link.
		const sections = [
			{
				key: `${key}:word`,
				inContextTranslation: inContextTranslation?.trim() || null,
				entry: popupEntry(word)
			},
			...(compound
				? [
						{
							key: `${key}:compound`,
							inContextTranslation: compound.inContextTranslation?.trim() || null,
							entry: popupEntry(compound.word)
						}
					]
				: [])
		].filter((section) => section.inContextTranslation || section.entry);
		const westernTime = timeAnnotation?.westernTime ?? null;
		const primary = sections.find((section) => section.entry)?.entry ?? null;
		return {
			key,
			kalenjin: word?.kalenjin ?? surfaceForm,
			sections,
			westernTime,
			timeNote: timeAnnotation?.note ?? null,
			wordId: primary?.wordId ?? null,
			wordSlug: primary?.wordSlug ?? null,
			hasInfo: Boolean(sections.length || westernTime)
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
		const spaceAbove = anchorRect.top - TOOLTIP_VIEWPORT_GUTTER;
		const spaceBelow = window.innerHeight - anchorRect.bottom - TOOLTIP_VIEWPORT_GUTTER;
		const placement =
			spaceAbove < tooltipRect.height && spaceBelow > spaceAbove ? 'below' : 'above';
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
		const nextPlacements = new Map(tooltipPlacements);
		nextPlacements.set(tooltipKey, placement);
		tooltipPlacements = nextPlacements;
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
		if (hideTooltipTimer) {
			clearTimeout(hideTooltipTimer);
			hideTooltipTimer = null;
		}
		activeTooltipKey = tooltipKey;
		window.dispatchEvent(new CustomEvent(OPEN_TOOLTIP_EVENT, { detail: tooltipKey }));
		if (pinnedTooltipKey && pinnedTooltipKey !== tooltipKey) {
			pinnedTooltipKey = null;
		}
		void tick().then(() => placeTooltip(tooltipKey, element));
	}

	function hideTooltip(tooltipKey: string) {
		if (pinnedTooltipKey === tooltipKey) return;
		if (hideTooltipTimer) clearTimeout(hideTooltipTimer);
		hideTooltipTimer = setTimeout(() => {
			hideTooltipTimer = null;
			if (pinnedTooltipKey === tooltipKey) return;
			if (activeTooltipKey === tooltipKey) {
				activeTooltipKey = null;
			}
		}, 180);
	}

	function keepTooltipOpen(tooltipKey: string) {
		if (hideTooltipTimer) {
			clearTimeout(hideTooltipTimer);
			hideTooltipTimer = null;
		}
		activeTooltipKey = tooltipKey;
	}

	function hideTooltipNow(tooltipKey: string) {
		if (pinnedTooltipKey === tooltipKey) return;
		if (hideTooltipTimer) {
			clearTimeout(hideTooltipTimer);
			hideTooltipTimer = null;
		}
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
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
		<span
			class="token-tooltip"
			class:visible={activeTooltipKey === popup.key || pinnedTooltipKey === popup.key}
			class:below={tooltipPlacements.get(popup.key) === 'below'}
			data-token-tooltip
			role="tooltip"
			style={tooltipStyleFor(popup.key)}
			onpointerenter={() => keepTooltipOpen(popup.key)}
			onpointerleave={() => hideTooltip(popup.key)}
			onclick={(event) => event.stopPropagation()}
			><span class="tooltip-part">
			{#each popup.sections as section, sectionIndex (section.key)}
				{#if sectionIndex > 0}
					<span class="tooltip-divider" aria-hidden="true"></span>
				{/if}
				{#if section.entry}
					<span class="tooltip-entry">
						<a
							class="tooltip-entry-title"
							href={dictionaryEntryHref({
								id: section.entry.wordId,
								kalenjin: section.entry.kalenjin,
								slug: section.entry.wordSlug ?? undefined
							})}
							onclick={(event) => event.stopPropagation()}
							>{section.entry.kalenjin}</a
						>
						{#if section.inContextTranslation}
							<span class="in-context">{section.inContextTranslation}</span>
						{/if}
						{#if section.entry.definitions.length > 0}
							<ol class="tooltip-definitions">
								{#each section.entry.definitions as definition}
									<li>{@html renderWordLinks(definition)}</li>
								{/each}
							</ol>
						{/if}
					</span>
				{:else if section.inContextTranslation}
					<span class="tooltip-entry">
						<span class="in-context">{section.inContextTranslation}</span>
					</span>
				{/if}
			{/each}
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
								token.inContextTranslation,
								token.compound
							)}
							{#if popup.wordId && !onTokenClick}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<span
									class="token-part linked"
									class:in-compound={Boolean(token.compound)}
							class:in-compound-cont={compoundContinuations.has(token.id)}
									class:pinned={pinnedTooltipKey === tooltipKey}
									role="link"
										tabindex="0"
										onpointerenter={(event) => prepareTooltip(tooltipKey, event.currentTarget)}
										onpointermove={() => keepTooltipOpen(tooltipKey)}
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
									class:linked={Boolean(segment.word || token.compound?.word)}
									class:in-compound={Boolean(token.compound)}
							class:in-compound-cont={compoundContinuations.has(token.id)}
										class:pinned={pinnedTooltipKey === tooltipKey}
										onpointerenter={(event) => prepareTooltip(tooltipKey, event.currentTarget)}
										onpointermove={() => keepTooltipOpen(tooltipKey)}
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
						token.inContextTranslation,
						token.compound
					)}
					{#if popup.wordId && !onTokenClick}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<span
							class="token-part linked"
							class:in-compound={Boolean(token.compound)}
							class:in-compound-cont={compoundContinuations.has(token.id)}
							class:pinned={pinnedTooltipKey === tooltipKey}
							role="link"
							tabindex="0"
							onpointerenter={(event) => prepareTooltip(tooltipKey, event.currentTarget)}
							onpointermove={() => keepTooltipOpen(tooltipKey)}
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
							class:linked={Boolean(token.word || token.compound?.word)}
							class:in-compound={Boolean(token.compound)}
							class:in-compound-cont={compoundContinuations.has(token.id)}
							class:pinned={pinnedTooltipKey === tooltipKey}
							onpointerenter={(event) => prepareTooltip(tooltipKey, event.currentTarget)}
							onpointermove={() => keepTooltipOpen(tooltipKey)}
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

	.token-part.linked::before {
		content: '';
		position: absolute;
		inset: -0.12em -0.12em -0.5em;
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

	.token-part:hover,
	.token-part:focus-visible,
	.token-part.pinned {
		z-index: 30;
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
		background: var(--bg-raised);
		border-radius: 0.45rem;
		color: var(--ink);
		box-sizing: border-box;
		cursor: default;
		font-size: 0.84rem;
		gap: 0.15rem;
		max-width: min(22rem, calc(100vw - 24px));
		min-width: 14rem;
		overflow: hidden;
		padding: 0;
		white-space: normal;
		z-index: 10;
	}

	.token-tooltip.below {
		bottom: auto;
		top: calc(100% + 0.65rem);
	}

	.tooltip-part {
		display: grid;
		gap: 0;
		text-align: left;
	}

	.tooltip-entry {
		display: grid;
		gap: 0.3rem;
		padding: 0 0.6rem 0.55rem;
	}

	.tooltip-entry-title {
		background: color-mix(in oklab, var(--accent) 12%, transparent);
		border-bottom: 1px solid color-mix(in oklab, var(--accent) 65%, transparent);
		color: inherit;
		display: block;
		font-family: var(--font-display);
		font-size: 1.02rem;
		font-weight: 700;
		line-height: 1.15;
		margin: 0 -0.6rem 0.15rem;
		padding: 0.48rem 0.6rem 0.38rem;
		text-decoration: none;
	}

	.tooltip-entry-title:hover,
	.tooltip-entry-title:focus-visible {
		color: var(--accent);
		cursor: pointer;
		outline: none;
		text-decoration: none;
	}

	.in-context {
		display: block;
		background: color-mix(in oklab, var(--surface) 70%, var(--bg-raised));
		border-radius: 0.3rem;
		padding: 0.18rem 0.35rem;
		font-weight: 600;
	}

	.tooltip-divider {
		display: block;
		height: 0;
		margin: 0;
		background: color-mix(in oklab, var(--ink) 25%, transparent);
	}

	.tooltip-divider + .tooltip-entry .tooltip-entry-title {
		border-top: 1px solid color-mix(in oklab, var(--accent) 65%, transparent);
	}

	.tooltip-definitions {
		display: grid;
		gap: 0.18rem;
		list-style-position: outside;
		margin: 0;
		padding-left: 1.25rem;
		text-align: left;
	}

	.tooltip-definitions li {
		padding-left: 0.08rem;
	}

	.tooltip-definitions :global(a) {
		color: inherit;
		cursor: pointer;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
	}

	.tooltip-definitions :global(a:hover),
	.tooltip-definitions :global(a:focus-visible) {
		color: var(--accent);
	}

	/* Members of a compound span share a full-width underline so the run
	   reads as one unit even though each word stays individually clickable. */
	.token-part.in-compound::after {
		left: 0;
		right: 0;
	}

	/* ...and members followed by another member bridge the flex gap so the
	   underline is continuous across the whole phrase. */
	.token-part.in-compound-cont::after {
		right: -0.45rem;
	}

	.time-note {
		margin-top: 0.15rem;
	}

	.time-note-detail {
		color: color-mix(in oklab, var(--ink) 82%, transparent);
		font-size: 0.76rem;
		line-height: 1.35;
	}

	.token-tooltip.visible {
		display: grid;
	}
</style>
