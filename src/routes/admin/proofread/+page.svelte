<script lang="ts">
	import { enhance } from '$app/forms';
	import { slide } from 'svelte/transition';
	import ClickToEditText from '$lib/components/ClickToEditText.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import SentenceTokenAnnotations from '$lib/components/SentenceTokenAnnotations.svelte';
	import SentenceTimeText from '$lib/components/SentenceTimeText.svelte';
	import StoryLinksIndicator from '$lib/components/StoryLinksIndicator.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
	let autoLemmaForm = $state<HTMLFormElement | null>(null);
	let pendingAutoLemmaForm = $state<HTMLFormElement | null>(null);
	let autoLemmaConfirmed = $state(false);
	let sentenceEnglish = $state<Record<string, string>>({});
	let lastEnglishSignature = $state('');
	const canSeeStoryLinks = $derived(data.user?.role === 'ADMIN');
	const statusTabs = $derived([
		{ label: 'All', href: '/admin/proofread', count: data.statusCounts.all, active: data.lemmaStatus === 'all' },
		{
			label: 'Missing lemmas',
			href: '/admin/proofread?lemmaStatus=missing',
			count: data.statusCounts.missing,
			active: data.lemmaStatus === 'missing'
		},
		{
			label: 'Fully linked',
			href: '/admin/proofread?lemmaStatus=complete',
			count: data.statusCounts.complete,
			active: data.lemmaStatus === 'complete'
		}
	]);

	$effect(() => {
		if (form && 'autoLemmaSuccess' in form && form.autoLemmaSuccess) {
			toast.success(form.autoLemmaSuccess);
		}
	});

	$effect(() => {
		if (form && 'proofreadSuccess' in form && form.proofreadSuccess) {
			toast.success(form.proofreadSuccess);
		}
	});

	$effect(() => {
		if (form && 'proofreadError' in form && form.proofreadError) {
			toast.error(form.proofreadError);
		}
	});

	$effect(() => {
		const signature = JSON.stringify(
			data.sentences.map((sentence) => ({ id: sentence.id, english: sentence.english }))
		);
		if (signature !== lastEnglishSignature) {
			sentenceEnglish = Object.fromEntries(
				data.sentences.map((sentence) => [sentence.id, sentence.english])
			);
			lastEnglishSignature = signature;
		}
	});

	function englishFor(sentence: PageData['sentences'][number]): string {
		return sentenceEnglish[sentence.id] ?? sentence.english;
	}

	async function saveEnglish(sentenceId: string, value: string) {
		// Keep this in step with the corpus sentence inline-edit endpoint; proofread cards
		// intentionally share that save path with the corpus editor.
		const response = await fetch(`/corpus/${sentenceId}/sentence-inline`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ field: 'english', value })
		});
		const result = (await response.json()) as {
			message?: string;
			sentence?: { english: string };
		};
		if (!response.ok || !result.sentence) {
			throw new Error(result.message ?? 'Could not save translation.');
		}

		sentenceEnglish = { ...sentenceEnglish, [sentenceId]: result.sentence.english };
		toast.success('Translation saved.');
	}

	function requestAutoLemma(event: SubmitEvent) {
		if (autoLemmaConfirmed) {
			autoLemmaConfirmed = false;
			return;
		}
		event.preventDefault();
		pendingAutoLemmaForm = event.currentTarget as HTMLFormElement;
	}

	function openAutoLemmaDialog() {
		pendingAutoLemmaForm = autoLemmaForm;
	}

	function cancelAutoLemma() {
		pendingAutoLemmaForm = null;
	}

	function confirmAutoLemma() {
		if (!pendingAutoLemmaForm) return;
		const form = pendingAutoLemmaForm;
		pendingAutoLemmaForm = null;
		autoLemmaConfirmed = true;
		form.requestSubmit();
	}
</script>

<svelte:head>
	<title>Proofread · Admin</title>
</svelte:head>

<h1 class="sr-only">Proofread</h1>

<nav class="proofread-tabs" aria-label="Lemma proofread filters">
	{#each statusTabs as tab}
		<a href={tab.href} class:active={tab.active}>
			<span>{tab.label}</span>
			<span>{tab.count.toLocaleString()}</span>
		</a>
	{/each}
	<form
		bind:this={autoLemmaForm}
		method="POST"
		action="?/autoLemmatize"
		use:enhance
		onsubmit={requestAutoLemma}
	>
		<button type="button" class="btn" onclick={openAutoLemmaDialog}>Run across corpus</button>
	</form>
</nav>

<section class="proofread-summary">
	<div>
		<span class="summary-number">{data.total.toLocaleString()}</span>
		<span class="summary-label">sentence{data.total === 1 ? '' : 's'} to proofread</span>
	</div>
	{#if data.total > 0}
		<p>
			Page {data.page.toLocaleString()} of {data.totalPages.toLocaleString()} · sorted by lemma completeness.
		</p>
	{/if}
</section>

{#if data.sentences.length === 0}
	<section class="form-card proofread-empty">
		<h2>No proofread queue</h2>
		<p>Automatic lemma matches that need staff review will appear here.</p>
	</section>
{:else}
	<div class="proofread-list">
		{#each data.sentences as sentence (sentence.id)}
			<section
				class="form-card proofread-sentence"
				out:slide={{ duration: 150 }}
			>
				<header class="proofread-sentence-head">
					<div>
						<div class="proofread-meta">
							<span>Updated {dateFmt.format(sentence.updatedAt)}</span>
							<span>{sentence.tokens.length} token{sentence.tokens.length === 1 ? '' : 's'}</span>
							<span
								class:complete={sentence.lemmaStats.missingUnits === 0}
								class="lemma-completion"
							>
								{sentence.lemmaStats.linkedUnits}/{sentence.lemmaStats.totalUnits} lemmas
							</span>
							{#if canSeeStoryLinks}
								<StoryLinksIndicator storyLinks={sentence.storyLinks} />
							{/if}
						</div>
						<h2>{sentence.kalenjin}</h2>
						<div class="sentence-english">
							<ClickToEditText
								value={englishFor(sentence)}
								label="English translation"
								rows={2}
								requiredMessage="Translation is required."
								preserveHeight
								onSave={(value) => saveEnglish(sentence.id, value)}
							>
								<SentenceTimeText text={englishFor(sentence)} />
							</ClickToEditText>
						</div>
					</div>
					<div class="proofread-sentence-actions">
						<a
							class="icon-btn icon-btn--open"
							href={`/corpus/${sentence.id}`}
							aria-label="Open in corpus"
						>
							<svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<path
									d="M6.5 3.5h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3M9 2.5h4.5V7M13.5 2.5 7 9"
									stroke="currentColor"
									stroke-width="1.4"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							<span class="icon-btn-tooltip" role="tooltip">Open in corpus</span>
						</a>
						<form method="POST" action="?/setSentenceStatus" use:enhance>
							<input type="hidden" name="sentenceId" value={sentence.id} />
							<button
								type="submit"
								name="status"
								value="STORY_ONLY"
								class="icon-btn icon-btn--ignore"
								aria-label="Mark story-only (exclude from corpus)"
							>
								<svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
									<path
										d="M3 2.5h6.5c1 0 1.8.8 1.8 1.8v9.4c-.8-.6-1.7-.9-2.7-.9H3V2.5Z"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linejoin="round"
									/>
									<path
										d="M5 5.5h4M5 7.5h4M5 9.5h2.5"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
									/>
								</svg>
								<span class="icon-btn-tooltip" role="tooltip">
									Mark story-only — keeps the sentence in the story but excludes it from the corpus.
								</span>
							</button>
						</form>
						<form method="POST" action="?/setSentenceStatus" use:enhance>
							<input type="hidden" name="sentenceId" value={sentence.id} />
							<button
								type="submit"
								name="status"
								value="IN_CORPUS"
								class="icon-btn icon-btn--confirm"
								aria-label="Mark proofread"
							>
								<svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
									<path
										d="M3.5 8.5l3 3 6-7"
										stroke="currentColor"
										stroke-width="1.8"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								<span class="icon-btn-tooltip" role="tooltip">Mark proofread</span>
							</button>
						</form>
					</div>
				</header>

				<SentenceTokenAnnotations
					entityId={sentence.id}
					entityIdField="sentenceId"
					entityKind="example"
					sentenceId={sentence.id}
					sentenceText={sentence.kalenjin}
					tokens={sentence.tokens}
					dictionaryWords={data.words}
					ignoredNormalizedForms={data.ignoredNormalizedForms}
					updateAction={`/corpus/${sentence.id}?/updateCorpusSentenceToken`}
					createAction={`/corpus/${sentence.id}?/createCorpusSentenceWord`}
					searchEndpoint={`/corpus/${sentence.id}/word-search`}
					tokenGroupEndpoint={`/corpus/${sentence.id}/token-groups`}
				/>
			</section>
		{/each}
	</div>

	{#if data.totalPages > 1}
		<nav class="proofread-pagination" aria-label="Lemma proofread pages">
			{#if data.pageHref.prev}
				<a class="btn-sm ghost" href={data.pageHref.prev}>Previous</a>
			{:else}
				<span class="btn-sm ghost disabled">Previous</span>
			{/if}
			<span>Page {data.page.toLocaleString()} of {data.totalPages.toLocaleString()}</span>
			{#if data.pageHref.next}
				<a class="btn-sm ghost" href={data.pageHref.next}>Next</a>
			{:else}
				<span class="btn-sm ghost disabled">Next</span>
			{/if}
		</nav>
	{/if}
{/if}

<ConfirmDialog
	open={pendingAutoLemmaForm !== null}
	title="Run auto-lemmatization?"
	message="This will scan the corpus and add in missing root forms and translations. Changed sentences will be queued for proofread."
	confirmLabel="Run across corpus"
	onconfirm={confirmAutoLemma}
	oncancel={cancelAutoLemma}
/>

<style>
	.proofread-sentence-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
	}
	.proofread-sentence-actions form {
		margin: 0;
	}

	.icon-btn {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-soft);
		cursor: pointer;
		display: inline-flex;
		flex: 0 0 auto;
		height: 2.5rem;
		justify-content: center;
		line-height: 1;
		padding: 0;
		position: relative;
		text-decoration: none;
		transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
		width: 2.5rem;
	}
	.icon-btn:hover,
	.icon-btn:focus-visible {
		background: var(--surface);
	}
	.icon-btn--ignore:hover,
	.icon-btn--ignore:focus-visible {
		background: color-mix(in oklab, var(--brand) 12%, transparent);
		border-color: color-mix(in oklab, var(--brand) 40%, transparent);
		color: var(--brand);
	}
	.icon-btn--confirm:hover,
	.icon-btn--confirm:focus-visible {
		background: color-mix(in oklab, var(--success, #2e7d32) 14%, transparent);
		border-color: color-mix(in oklab, var(--success, #2e7d32) 55%, transparent);
		color: var(--success, #2e7d32);
	}
	.icon-btn:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}
	.icon-btn:disabled {
		cursor: progress;
		opacity: 0.6;
	}

	.icon-btn-tooltip {
		background: var(--tooltip-bg);
		border-radius: 6px;
		bottom: calc(100% + 0.35rem);
		color: var(--tooltip-ink);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 500;
		left: 50%;
		line-height: 1.35;
		max-width: 14rem;
		opacity: 0;
		padding: 0.4rem 0.55rem;
		pointer-events: none;
		position: absolute;
		text-align: left;
		text-transform: none;
		transform: translateX(-50%);
		transition: opacity 0s linear;
		white-space: normal;
		width: max-content;
		z-index: 20;
	}
	.icon-btn:hover .icon-btn-tooltip,
	.icon-btn:focus-visible .icon-btn-tooltip {
		opacity: 1;
	}
	.proofread-tabs {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0 0 18px;
	}
	.proofread-tabs form {
		margin: 0 0 0 auto;
	}
	.proofread-tabs a {
		align-items: center;
		border: 1px solid var(--line-soft);
		border-radius: 6px;
		color: var(--ink);
		display: inline-flex;
		font-size: 13px;
		gap: 8px;
		padding: 7px 10px;
		text-decoration: none;
	}
	.proofread-tabs a.active {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--brand-ink);
	}
	.proofread-summary {
		align-items: baseline;
		display: flex;
		gap: 14px;
		justify-content: space-between;
		margin: -8px 0 18px;
	}
	.summary-number {
		color: var(--accent);
		font-family: var(--font-display);
		font-size: 30px;
		font-weight: 500;
	}
	.summary-label,
	.proofread-summary p,
	.proofread-meta,
	.proofread-empty p {
		color: var(--ink-mute);
	}
	.proofread-summary p {
		font-size: 13px;
		margin: 0;
	}
	.proofread-list {
		display: grid;
		gap: 18px;
	}
	.proofread-sentence-head {
		align-items: flex-start;
		border-bottom: 1px solid var(--line-soft);
		display: flex;
		gap: 18px;
		justify-content: space-between;
		margin-bottom: 16px;
		padding-bottom: 14px;
	}
	.proofread-sentence-head h2,
	.proofread-empty h2 {
		font-family: var(--font-display);
		font-size: 21px;
		font-weight: 500;
		line-height: 1.35;
		margin: 4px 0 4px;
	}
	.proofread-empty p {
		margin: 0;
	}
	.sentence-english {
		color: var(--ink-soft);
		font-size: 14px;
		margin: 8px 0 0;
	}

	.proofread-meta {
		display: flex;
		flex-wrap: wrap;
		font-size: 12px;
		gap: 10px;
	}
	.lemma-completion {
		color: var(--danger, #b42318);
		font-weight: 600;
	}
	.lemma-completion.complete {
		color: var(--accent);
	}
	.proofread-pagination {
		align-items: center;
		display: flex;
		gap: 10px;
		justify-content: center;
		margin: 22px 0 0;
	}
	.proofread-pagination span {
		color: var(--ink-mute);
		font-size: 13px;
	}
	.proofread-pagination .disabled {
		opacity: 0.45;
		pointer-events: none;
	}
	.proofread-empty {
		padding: 28px;
	}

	@media (max-width: 720px) {
		.proofread-summary,
		.proofread-sentence-head {
			display: block;
		}
		.proofread-sentence-actions {
			justify-content: flex-start;
			margin-top: 12px;
		}
		.proofread-tabs form {
			margin-left: 0;
		}
	}
</style>
