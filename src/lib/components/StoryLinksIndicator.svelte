<script lang="ts">
	import type { SentenceStoryLink } from '$lib/sentence-story-links';

	let { storyLinks = [] }: { storyLinks?: SentenceStoryLink[] } = $props();

	function labelFor(link: SentenceStoryLink): string {
		return `Lesson ${link.lessonNumber}: ${link.lessonTitle}`;
	}
</script>

{#if storyLinks.length > 0}
	<span class="story-links" aria-label="Attached stories">
		{#each storyLinks as link (link.id)}
			<a class="story-link" href={link.href} aria-label={`Open ${labelFor(link)}`}>
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M2.5 3.2c0-.7.5-1.2 1.2-1.2h2.4c.8 0 1.5.4 1.9 1 .4-.6 1.1-1 1.9-1h2.4c.7 0 1.2.5 1.2 1.2v9.6c0 .7-.5 1.2-1.2 1.2H9.9c-.8 0-1.5.4-1.9 1-.4-.6-1.1-1-1.9-1H3.7c-.7 0-1.2-.5-1.2-1.2V3.2Z"
						stroke="currentColor"
						stroke-width="1.3"
						stroke-linejoin="round"
					/>
					<path d="M8 3v12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
				</svg>
				<span class="story-tooltip" role="tooltip">{labelFor(link)}</span>
			</a>
		{/each}
	</span>
{/if}

<style>
	.story-links {
		align-items: center;
		display: inline-flex;
		flex: 0 0 auto;
		gap: 4px;
		position: relative;
		z-index: 2;
	}

	.story-link {
		align-items: center;
		background: color-mix(in oklab, var(--brand) 10%, transparent);
		border: 1px solid color-mix(in oklab, var(--brand) 25%, transparent);
		border-radius: 999px;
		color: var(--brand);
		display: inline-flex;
		height: 1.35rem;
		justify-content: center;
		padding: 0;
		position: relative;
		text-decoration: none;
		width: 1.35rem;
	}

	.story-link:hover,
	.story-link:focus-visible {
		background: color-mix(in oklab, var(--brand) 16%, transparent);
		color: var(--brand-ink);
		text-decoration: none;
	}

	.story-link:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: 2px;
	}

	.story-tooltip {
		background: var(--tooltip-bg);
		border-radius: 6px;
		bottom: calc(100% + 0.35rem);
		color: var(--tooltip-ink);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 500;
		left: 50%;
		line-height: 1.35;
		max-width: 16rem;
		opacity: 0;
		padding: 0.45rem 0.6rem;
		pointer-events: none;
		position: absolute;
		text-align: left;
		transform: translateX(-50%);
		transition: opacity 0s linear;
		white-space: normal;
		width: max-content;
		z-index: 20;
	}

	.story-link:hover .story-tooltip,
	.story-link:focus-visible .story-tooltip {
		opacity: 1;
	}
</style>
