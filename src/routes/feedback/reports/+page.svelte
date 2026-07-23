<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import FilterChips from '$lib/components/FilterChips.svelte';
	import { REPORT_ISSUE_LABELS } from '$lib/report-issue-types';
	import { toast } from '$lib/stores/toast.svelte';
	import { dictionaryEntryHref } from '$lib/word-url';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const dateFmt = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	const statusTabs = $derived([
		{
			label: 'Open',
			href: '/admin/reports?status=open',
			count: data.statusCounts.open,
			active: data.statusFilter === 'open'
		},
		{
			label: 'Resolved',
			href: '/admin/reports?status=resolved',
			count: data.statusCounts.resolved,
			active: data.statusFilter === 'resolved'
		},
		{
			label: 'Dismissed',
			href: '/admin/reports?status=dismissed',
			count: data.statusCounts.dismissed,
			active: data.statusFilter === 'dismissed'
		},
		{
			label: 'All',
			href: '/admin/reports?status=all',
			count: data.statusCounts.all,
			active: data.statusFilter === 'all'
		}
	]);

	let pendingDeleteForm = $state<HTMLFormElement | null>(null);

	function requestDelete(event: SubmitEvent) {
		if (pendingDeleteForm === event.currentTarget) return;
		event.preventDefault();
		pendingDeleteForm = event.currentTarget as HTMLFormElement;
	}

	function cancelDelete() {
		pendingDeleteForm = null;
	}

	function confirmDelete() {
		if (!pendingDeleteForm) return;
		const f = pendingDeleteForm;
		pendingDeleteForm = null;
		f.submit();
	}

	$effect(() => {
		if (form && 'success' in form && form.success) toast.success(form.success);
	});
	$effect(() => {
		if (form && 'error' in form && form.error) toast.error(form.error);
	});

	function reporterLabel(reporter: PageData['reports'][number]['reporter']): string {
		if (!reporter) return 'Anonymous';
		return reporter.displayName ?? reporter.username;
	}

	function resolverLabel(resolver: PageData['reports'][number]['resolvedBy']): string {
		if (!resolver) return 'unknown';
		return resolver.displayName ?? resolver.username;
	}

	function targetHref(report: PageData['reports'][number]): string | null {
		if (report.word) return dictionaryEntryHref(report.word);
		if (report.sentence) return `/corpus/${report.sentence.id}`;
		return null;
	}

	function targetText(report: PageData['reports'][number]): string {
		if (report.word) return report.word.kalenjin;
		if (report.sentence) return report.sentence.kalenjin;
		return '(deleted)';
	}

	function targetGloss(report: PageData['reports'][number]): string {
		if (report.word) return report.word.translations;
		if (report.sentence) return report.sentence.english;
		return '';
	}
</script>

<svelte:head>
	<title>Reports · Admin</title>
</svelte:head>

<FilterChips label="Report status filters" items={statusTabs} />

{#if data.reports.length === 0}
	<section class="form-card reports-empty">
		<h2>No reports here</h2>
		<p>When someone reports a word or sentence, it'll show up in this list.</p>
	</section>
{:else}
	<div class="reports-list">
		{#each data.reports as report (report.id)}
			{@const href = targetHref(report)}
			<section class="form-card report-card">
				<header class="report-head">
					<div class="report-meta">
						<span class="report-badge report-badge-{report.status.toLowerCase()}">
							{report.status}
						</span>
						<span class="report-target-type">
							{report.targetType === 'WORD' ? 'Word' : 'Sentence'}
						</span>
						<span class="muted">{dateFmt.format(report.createdAt)}</span>
						<span class="muted">by {reporterLabel(report.reporter)}</span>
					</div>
					<div class="report-issue">{REPORT_ISSUE_LABELS[report.issueType]}</div>
				</header>

				<div class="report-target">
					{#if href}
						<a href={href} class="report-target-link">
							<span class="report-target-text">{targetText(report)}</span>
							{#if targetGloss(report)}
								<span class="report-target-gloss">— {targetGloss(report)}</span>
							{/if}
						</a>
					{:else}
						<span class="muted">Target deleted</span>
					{/if}
				</div>

				{#if report.suggestedFix}
					<div class="report-fix">
						<span class="report-fix-label">Suggested fix</span>
						<p>{report.suggestedFix}</p>
					</div>
				{/if}

				{#if report.status !== 'OPEN' && report.resolvedAt}
					<div class="report-resolution muted">
						{report.status === 'RESOLVED' ? 'Resolved' : 'Dismissed'}
						{dateFmt.format(report.resolvedAt)} by {resolverLabel(report.resolvedBy)}
					</div>
				{/if}

				<div class="report-actions">
					{#if report.status === 'OPEN'}
						<form method="POST" action="?/resolve" use:enhance>
							<input type="hidden" name="reportId" value={report.id} />
							<button type="submit" class="btn-sm">Mark resolved</button>
						</form>
						<form method="POST" action="?/dismiss" use:enhance>
							<input type="hidden" name="reportId" value={report.id} />
							<button type="submit" class="btn-sm ghost">Dismiss</button>
						</form>
					{:else}
						<form method="POST" action="?/reopen" use:enhance>
							<input type="hidden" name="reportId" value={report.id} />
							<button type="submit" class="btn-sm ghost">Reopen</button>
						</form>
					{/if}
					<form method="POST" action="?/delete" onsubmit={requestDelete} use:enhance>
						<input type="hidden" name="reportId" value={report.id} />
						<button type="submit" class="btn-sm danger">Delete</button>
					</form>
				</div>
			</section>
		{/each}
	</div>
{/if}

<ConfirmDialog
	open={pendingDeleteForm !== null}
	title="Delete this report?"
	message="The report will be permanently removed."
	confirmLabel="Delete report"
	variant="danger"
	onconfirm={confirmDelete}
	oncancel={cancelDelete}
/>

<style>
	.reports-list {
		display: grid;
		gap: 12px;
	}
	.report-card {
		display: grid;
		gap: 10px;
	}
	.report-head {
		align-items: flex-start;
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		justify-content: space-between;
	}
	.report-meta {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		font-size: 12px;
		gap: 10px;
	}
	.report-badge {
		border-radius: 4px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.08em;
		padding: 2px 6px;
		text-transform: uppercase;
	}
	.report-badge-open {
		background: color-mix(in oklch, var(--accent) 18%, transparent);
		color: var(--accent);
	}
	.report-badge-resolved {
		background: color-mix(in oklch, #16a34a 18%, transparent);
		color: #16a34a;
	}
	.report-badge-dismissed {
		background: color-mix(in oklch, var(--ink-mute) 18%, transparent);
		color: var(--ink-mute);
	}
	.report-target-type {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.report-issue {
		color: var(--ink);
		font-size: 14px;
		font-weight: 500;
	}
	.report-target-link {
		color: color-mix(in oklch, var(--danger) 60%, var(--ink) 40%);
		text-decoration: none;
	}
	.report-target-link:hover,
	.report-target-link:hover .report-target-text {
		text-decoration: none;
	}
	.report-target-text {
		font-family: var(--font-display);
		font-size: 16px;
	}
	.report-target-gloss {
		color: var(--ink-soft);
		font-size: 14px;
		margin-left: 4px;
	}
	.report-fix {
		background: color-mix(in oklch, var(--ink) 4%, var(--paper));
		border-radius: 6px;
		padding: 8px 12px;
	}
	.report-fix-label {
		color: var(--ink-mute);
		display: block;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		margin-bottom: 4px;
		text-transform: uppercase;
	}
	.report-fix p {
		margin: 0;
		white-space: pre-wrap;
	}
	.report-resolution {
		font-size: 12px;
	}
	.report-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.muted {
		color: var(--ink-mute);
	}
	.reports-empty {
		text-align: center;
	}
	.reports-empty h2 {
		margin: 0 0 8px;
	}
	.reports-empty p {
		color: var(--ink-soft);
		margin: 0;
	}
</style>
