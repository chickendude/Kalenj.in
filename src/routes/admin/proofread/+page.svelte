<script lang="ts">
	import { enhance } from '$app/forms';
	import ClickToEditText from '$lib/components/ClickToEditText.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import FormErrorFeedback from '$lib/components/FormErrorFeedback.svelte';
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
	<title>Lemma proofread · Admin</title>
</svelte:head>

<div class="page-head proofread-head">
	<div>
		<div class="page-kicker">Admin</div>
		<h1>Lemma proofread</h1>
		<p>Review sentences where lemmas were filled automatically from earlier confirmed matches.</p>
	</div>
	<div class="proofread-actions">
		<form
			bind:this={autoLemmaForm}
			method="POST"
			action="?/autoLemmatize"
			use:enhance
			onsubmit={requestAutoLemma}
		>
			<button type="button" class="btn" onclick={openAutoLemmaDialog}>Run across corpus</button>
		</form>
	</div>
</div>

<FormErrorFeedback error={form && 'proofreadError' in form ? form.proofreadError : null} />

<nav class="proofread-tabs" aria-label="Lemma proofread filters">
	{#each statusTabs as tab}
		<a href={tab.href} class:active={tab.active}>
			<span>{tab.label}</span>
			<span>{tab.count.toLocaleString()}</span>
		</a>
	{/each}
</nav>

<section class="proofread-summary">
	<div>
		<span class="summary-number">{data.total.toLocaleString()}</span>
		<span class="summary-label">sentence{data.total === 1 ? '' : 's'} in this view</span>
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
			<section class="form-card proofread-sentence">
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
						<a href={`/corpus/${sentence.id}`} class="btn-sm ghost">Open</a>
						<form method="POST" action="?/markProofread" use:enhance>
							<input type="hidden" name="sentenceId" value={sentence.id} />
							<button type="submit" class="btn-sm">Mark proofread</button>
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
	.proofread-head {
		align-items: flex-start;
		display: flex;
		gap: 18px;
		justify-content: space-between;
	}
	.proofread-actions,
	.proofread-sentence-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
	}
	.proofread-actions form,
	.proofread-sentence-actions form {
		margin: 0;
	}
	.proofread-tabs {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: -4px 0 18px;
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
		.proofread-head,
		.proofread-summary,
		.proofread-sentence-head {
			display: block;
		}
		.proofread-actions,
		.proofread-sentence-actions {
			justify-content: flex-start;
			margin-top: 12px;
		}
	}
</style>
