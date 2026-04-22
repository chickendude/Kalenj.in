<script lang="ts">
	import { enhance } from '$app/forms';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import { firstTranslation } from '$lib/translations';
	import { stripWordLinks } from '$lib/word-links';
	import type { WordSearchHit } from './search/+server';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type ScheduleRow = PageData['schedule'][number];
	type WordInfo = ScheduleRow['word'];

	let editingDayKey = $state<number | null>(null);
	let query = $state('');
	let searchResults = $state<WordSearchHit[] | null>(null);
	let searchQuery = $state('');
	let searchLoading = $state(false);
	let editorRoot: HTMLDivElement | undefined = $state();
	let searchInput: HTMLInputElement | undefined = $state();

	let wordOverrides = $state<Map<string, WordInfo>>(new Map());
	let toast = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | null = null;

	type PendingAssign = { kalenjin: string; lastShownOn: string; formEl: HTMLFormElement };
	let pendingAssign = $state<PendingAssign | null>(null);
	let bypassConfirm = false;
	let confirmButton: HTMLButtonElement | undefined = $state();

	function dateKey(d: Date): string {
		return d.toISOString().slice(0, 10);
	}

	const schedule = $derived(
		data.schedule.map((row) => {
			const override = wordOverrides.get(dateKey(row.date));
			return override ? { ...row, word: override } : row;
		})
	);

	function showToast(message: string) {
		if (toastTimer) clearTimeout(toastTimer);
		toast = message;
		toastTimer = setTimeout(() => {
			toast = null;
			toastTimer = null;
		}, 3200);
	}

	function dismissToast() {
		if (toastTimer) {
			clearTimeout(toastTimer);
			toastTimer = null;
		}
		toast = null;
	}

	const dateFmt = new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	const longFmt = new Intl.DateTimeFormat(undefined, {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});

	function isoDate(d: Date): string {
		const y = d.getUTCFullYear();
		const m = String(d.getUTCMonth() + 1).padStart(2, '0');
		const day = String(d.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	function openEditor(dayKey: number) {
		editingDayKey = dayKey;
		query = '';
		searchResults = null;
		searchQuery = '';
		searchLoading = false;
	}

	function closeEditor() {
		editingDayKey = null;
		query = '';
		searchResults = null;
		searchQuery = '';
		searchLoading = false;
	}

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let searchSeq = 0;

	async function runSearch(q: string) {
		const seq = ++searchSeq;
		if (q.trim().length === 0) {
			searchResults = null;
			searchQuery = '';
			searchLoading = false;
			return;
		}
		searchLoading = true;
		try {
			const res = await fetch(`/admin/word-of-day/search?q=${encodeURIComponent(q)}`);
			if (!res.ok) throw new Error(`Search failed: ${res.status}`);
			const data = (await res.json()) as { results: WordSearchHit[]; query: string };
			if (seq !== searchSeq) return;
			searchResults = data.results;
			searchQuery = data.query;
		} catch {
			if (seq !== searchSeq) return;
			searchResults = [];
			searchQuery = q;
		} finally {
			if (seq === searchSeq) searchLoading = false;
		}
	}

	function onQueryInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		query = value;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => runSearch(value), 180);
	}

	$effect(() => {
		if (editingDayKey === null) return;

		function onKey(event: KeyboardEvent) {
			if (event.key !== 'Escape') return;
			if (pendingAssign) return;
			closeEditor();
		}
		function onPointerDown(event: PointerEvent) {
			if (pendingAssign) return;
			if (editorRoot && !editorRoot.contains(event.target as Node)) {
				closeEditor();
			}
		}

		document.addEventListener('keydown', onKey);
		document.addEventListener('pointerdown', onPointerDown);
		return () => {
			document.removeEventListener('keydown', onKey);
			document.removeEventListener('pointerdown', onPointerDown);
		};
	});

	$effect(() => {
		if (!pendingAssign) return;

		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape') cancelConfirm();
		}
		document.addEventListener('keydown', onKey);
		queueMicrotask(() => confirmButton?.focus());
		return () => {
			document.removeEventListener('keydown', onKey);
		};
	});

	function cancelConfirm() {
		pendingAssign = null;
	}

	function confirmAssign() {
		if (!pendingAssign) return;
		const formEl = pendingAssign.formEl;
		pendingAssign = null;
		bypassConfirm = true;
		formEl.requestSubmit();
	}

	function handleConfirmBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) cancelConfirm();
	}

	function handleConfirmBackdropKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			cancelConfirm();
		}
	}

	$effect(() => {
		if (editingDayKey !== null) {
			queueMicrotask(() => searchInput?.focus());
		}
	});
</script>

<svelte:head>
	<title>Word of the day</title>
</svelte:head>

<div class="page-head">
	<div>
		<div class="page-kicker">Schedule</div>
		<h1>Word of the day</h1>
		<p>
			The schedule is generated a month in advance, avoiding repeats when possible. Override any
			day below.
		</p>
	</div>
	<div class="page-stat">
		<b>{data.usedCount.toLocaleString()}</b>
		of {data.wordCount.toLocaleString()} word{data.wordCount === 1 ? '' : 's'} used
	</div>
</div>

{#if form && 'assignError' in form && form.assignError}
	<div class="form-feedback error">{form.assignError}</div>
{/if}
{#if form && 'regenerateSuccess' in form && form.regenerateSuccess}
	<div class="form-feedback success">{form.regenerateSuccess}</div>
{/if}

<section class="form-card wod-admin-actions">
	<div>
		<h2>Schedule</h2>
		<p class="wod-admin-lede">
			Showing {longFmt.format(data.rangeStart)} through {longFmt.format(data.rangeEnd)}.
		</p>
	</div>
	<form method="POST" action="?/regenerate" use:enhance>
		<button type="submit" class="btn ghost">Fill missing days</button>
	</form>
</section>

<table class="users-table wod-admin-table">
	<thead>
		<tr>
			<th>Date</th>
			<th>Word</th>
			<th>Translation</th>
			<th></th>
		</tr>
	</thead>
	<tbody>
		{#each schedule as row (row.id)}
			{@const iso = isoDate(row.date)}
			<tr class:past={row.isPast} class:today={row.isToday}>
				<td>
					<div class="wod-admin-date">
						<span class="mono">{dateFmt.format(row.date)}</span>
						{#if row.isToday}
							<span class="role-pill admin">Today</span>
						{:else if row.isPast}
							<span class="role-pill manager">Past</span>
						{/if}
					</div>
				</td>
				<td>
					<div class="wod-admin-word-cell">
						<a href={`/dictionary/${row.word.id}`} class="wod-admin-word" title={row.word.kalenjin}
							>{row.word.kalenjin}</a
						>
						{#if row.word.partOfSpeech}
							<span class="pos-chip tiny">{PART_OF_SPEECH_LABELS[row.word.partOfSpeech]}</span>
						{/if}
					</div>
				</td>
				<td class="wod-admin-gloss" title={stripWordLinks(row.word.translations)}>
					{stripWordLinks(row.word.translations)}
				</td>
				<td>
					<div class="row-actions">
						{#if row.isPast}
							<span class="wod-admin-note mono">locked</span>
						{:else if editingDayKey === row.dayKey}
							<button type="button" class="btn-sm ghost" onclick={closeEditor}>Cancel</button>
						{:else}
							<button type="button" class="btn-sm ghost" onclick={() => openEditor(row.dayKey)}>
								Change
							</button>
						{/if}
					</div>
				</td>
			</tr>
			{#if editingDayKey === row.dayKey && !row.isPast}
				<tr class="wod-admin-edit-row">
					<td colspan="4">
						<div
							class="wod-admin-edit"
							bind:this={editorRoot}
							transition:slide={{ duration: 240, easing: cubicOut }}
						>
							<div class="wod-admin-search">
								<input
									bind:this={searchInput}
									class="input"
									placeholder="Search by Kalenjin or English…"
									autocomplete="off"
									value={query}
									oninput={onQueryInput}
								/>
								{#if searchLoading}
									<span class="wod-admin-note mono">searching…</span>
								{/if}
							</div>

							{#if searchResults !== null}
								{#if searchResults.length === 0}
									<p class="wod-admin-empty">
										No matches for “{searchQuery}”.
									</p>
								{:else}
									<ul class="wod-admin-results">
										{#each searchResults as hit (hit.id)}
											<li>
												<div class="wod-admin-hit">
													<div>
														<span class="wod-admin-hit-word">{hit.kalenjin}</span>
														{#if hit.partOfSpeech}
															<span class="pos-chip tiny">
																{PART_OF_SPEECH_LABELS[
																	hit.partOfSpeech as keyof typeof PART_OF_SPEECH_LABELS
																]}
															</span>
														{/if}
														<span class="wod-admin-hit-gloss">
															{firstTranslation(stripWordLinks(hit.translations))}
														</span>
													</div>
													<div class="wod-admin-hit-meta">
														{#if hit.lastUsedOn}
															<span
																class="wod-admin-last-used"
																class:future={hit.lastUsedIsFuture}
															>
																{hit.lastUsedIsFuture ? 'Scheduled' : 'Last used'}:
																<span class="mono">{hit.lastUsedOn}</span>
															</span>
														{:else}
															<span class="wod-admin-last-used none">Never used</span>
														{/if}
														<form
															method="POST"
															action="?/assign"
															use:enhance={({ cancel, formElement }) => {
																if (hit.lastShownOn && !bypassConfirm) {
																	cancel();
																	pendingAssign = {
																		kalenjin: hit.kalenjin,
																		lastShownOn: hit.lastShownOn,
																		formEl: formElement
																	};
																	return;
																}
																bypassConfirm = false;
																return async ({ result }) => {
																	if (result.type === 'success') {
																		const payload = result.data?.assignSuccess as
																			| { message: string; updates: Array<{ date: string | Date; word: WordInfo }> }
																			| undefined;
																		if (payload) {
																			const next = new Map(wordOverrides);
																			for (const u of payload.updates) {
																				const d = u.date instanceof Date ? u.date : new Date(u.date);
																				next.set(dateKey(d), u.word);
																			}
																			wordOverrides = next;
																			showToast(payload.message);
																		}
																		closeEditor();
																	} else if (result.type === 'failure') {
																		const err = (result.data?.assignError as string | undefined) ?? 'Assign failed.';
																		showToast(err);
																	}
																};
															}}
														>
															<input type="hidden" name="date" value={iso} />
															<input type="hidden" name="wordId" value={hit.id} />
															<button type="submit" class="btn-sm">Assign</button>
														</form>
													</div>
												</div>
											</li>
										{/each}
									</ul>
								{/if}
							{:else}
								<p class="wod-admin-empty">
									Start typing to find a word to assign to {longFmt.format(row.date)}.
								</p>
							{/if}
						</div>
					</td>
				</tr>
			{/if}
		{/each}
	</tbody>
</table>

{#if pendingAssign}
	<div
		class="wod-confirm-backdrop"
		role="presentation"
		onclick={handleConfirmBackdropClick}
		onkeydown={handleConfirmBackdropKeydown}
	>
		<div
			class="wod-confirm-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="wod-confirm-title"
			tabindex="-1"
		>
			<h2 id="wod-confirm-title">Word already used</h2>
			<p>
				<strong>{pendingAssign.kalenjin}</strong> was the Word of the Day on
				<span class="mono">{pendingAssign.lastShownOn}</span>. Use it again?
			</p>
			<div class="wod-confirm-actions">
				<button type="button" class="btn ghost" onclick={cancelConfirm}>Cancel</button>
				<button type="button" class="btn" bind:this={confirmButton} onclick={confirmAssign}>
					Use again
				</button>
			</div>
		</div>
	</div>
{/if}

{#if toast}
	<div class="wod-toast" role="status" aria-live="polite">
		<span class="wod-toast-text">{toast}</span>
		<button
			type="button"
			class="wod-toast-close"
			onclick={dismissToast}
			aria-label="Dismiss notification"
		>
			×
		</button>
	</div>
{/if}
