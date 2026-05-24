<script lang="ts">
	import { enhance } from '$app/forms';
	import { slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import AudioPlayButton from '$lib/components/AudioPlayButton.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { pickDefaultMergeTarget } from '$lib/duplicate-merge-default';

	let { data, form } = $props();

	type Group = (typeof data)['groups'][number];
	type Sentence = Group['sentences'][number];

	const totalDuplicates = $derived(
		data.groups.reduce((sum, g) => sum + g.sentences.length, 0)
	);

	function formatDate(value: string | Date): string {
		const d = value instanceof Date ? value : new Date(value);
		return d.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	type ConfirmState = {
		title: string;
		message: string;
		confirmLabel: string;
		variant: 'danger' | 'primary';
		form: HTMLFormElement;
	};

	let confirmState = $state<ConfirmState | null>(null);
	let confirmedForm: HTMLFormElement | null = null;

	// Intercepts a form submit to confirm via the custom ConfirmDialog instead
	// of a native confirm(). On confirm we re-submit the same form, this time
	// letting it through.
	function confirmSubmit(message: string) {
		const isMerge = /^merge/i.test(message);
		return ({
			cancel,
			formElement
		}: {
			cancel: () => void;
			formElement: HTMLFormElement;
		}) => {
			if (confirmedForm === formElement) {
				confirmedForm = null;
				return;
			}
			cancel();
			confirmState = {
				title: isMerge ? 'Merge group' : 'Please confirm',
				message,
				confirmLabel: isMerge ? 'Merge' : 'Delete',
				variant: isMerge ? 'primary' : 'danger',
				form: formElement
			};
		};
	}

	function onConfirmDialogConfirm() {
		const form = confirmState?.form ?? null;
		confirmState = null;
		if (form) {
			confirmedForm = form;
			form.requestSubmit();
		}
	}

	function onConfirmDialogCancel() {
		confirmState = null;
	}

	function shortText(value: string, empty = '(empty)'): string {
		const t = value.trim();
		if (!t) return empty;
		return t.length > 60 ? `${t.slice(0, 57)}…` : t;
	}

	function distinct(values: (string | null)[]): string[] {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const v of values) {
			const t = (v ?? '').trim();
			if (!t || seen.has(t)) continue;
			seen.add(t);
			out.push(t);
		}
		return out;
	}

	type MergeForm = {
		targetId: string;
		english: string;
		notes: string;
		audioSourceId: string;
		imageSourceId: string;
	};

	let mergeKey = $state<string | null>(null);
	let mergeForm = $state<MergeForm>({
		targetId: '',
		english: '',
		notes: '',
		audioSourceId: '',
		imageSourceId: ''
	});

	function openMerge(group: Group) {
		if (mergeKey === group.key) {
			mergeKey = null;
			return;
		}
		// Richest lemmatization/context-translation copy by default, unless a
		// lesson/story copy is present (then the safe non-story default).
		const target = pickDefaultMergeTarget(group.sentences);
		const firstEnglish = distinct(group.sentences.map((s) => s.english))[0] ?? '';
		const firstNotes = distinct(group.sentences.map((s) => s.notes))[0] ?? '';
		const audioPick =
			(target.audioUrl ? target : group.sentences.find((s) => s.audioUrl)) ?? null;
		const imagePick =
			(target.imageUrl ? target : group.sentences.find((s) => s.imageUrl)) ?? null;

		mergeForm = {
			targetId: target.id,
			english: target.english.trim() || firstEnglish,
			notes: (target.notes ?? '').trim() || firstNotes,
			audioSourceId: audioPick?.id ?? '',
			imageSourceId: imagePick?.id ?? ''
		};
		mergeKey = group.key;
	}

	function sentenceLabel(s: Sentence): string {
		return shortText(s.english || s.kalenjin);
	}

	// Capture-phase click so selection runs before AudioPlayButton's
	// stopPropagation: clicking (or keyboard-activating) the play icon both
	// picks that audio and plays it. No inline handler on a non-interactive
	// element, so no a11y lint.
	function captureClick(node: HTMLElement, handler: () => void) {
		let current = handler;
		const onClick = () => current();
		node.addEventListener('click', onClick, true);
		return {
			update(next: () => void) {
				current = next;
			},
			destroy() {
				node.removeEventListener('click', onClick, true);
			}
		};
	}

	$effect(() => {
		if (form && 'error' in form && form.error) toast.show(form.error, { ms: 4000 });
	});

	$effect(() => {
		if (form && 'deletedCount' in form && form.deletedCount) {
			const n = form.deletedCount;
			let msg = `Deleted ${n} sentence${n === 1 ? '' : 's'}.`;
			if (form.skippedCount) {
				msg += ` Skipped ${form.skippedCount} linked to a lesson or story.`;
			}
			toast.success(msg, 4000);
		}
	});

	$effect(() => {
		if (form && 'mergedCount' in form) {
			const m = form.mergedCount;
			let msg = `Merged ${m} cop${m === 1 ? 'y' : 'ies'} into the kept sentence. Audio, translation, notes and word links were preserved.`;
			if (form.storySkips) {
				msg += ` Kept ${form.storySkips} story-sourced cop${form.storySkips === 1 ? 'y' : 'ies'} (owned by a story).`;
			}
			if (form.lessonSkips) {
				msg += ` Kept ${form.lessonSkips} cop${form.lessonSkips === 1 ? 'y' : 'ies'} still attached to a different lesson.`;
			}
			toast.success(msg, 5000);
		}
	});

	$effect(() => {
		if (form && 'uniqueToggled' in form) {
			toast.success(
				form.isUnique
					? 'Marked unique. This spelling is hidden once every copy is marked unique; a new unmarked copy will bring it back.'
					: 'Unmarked. This sentence is treated as a normal duplicate again.',
				4000
			);
		}
	});
</script>

<svelte:head>
	<title>Duplicate sentences — Kalenj.in</title>
</svelte:head>

<h1 class="sr-only">Duplicate sentences</h1>

<section>
	{#if data.groups.length === 0}
		<div class="empty">
			<p>No duplicate sentences found.</p>
		</div>
	{:else}
		<ul class="group-list">
			<li class="group-card duplicate-overview-card">
				<div class="duplicate-stats" aria-label="Duplicate sentence totals">
					<div>
						<b>{data.groups.length}</b>
						<span>group{data.groups.length === 1 ? '' : 's'}</span>
					</div>
					<div>
						<b>{totalDuplicates}</b>
						<span>sentence{totalDuplicates === 1 ? '' : 's'}</span>
					</div>
				</div>
			</li>
			{#each data.groups as group (group.key)}
				{@const groupDeletable = group.sentences.filter((s) => !s.storySentence)}
				<li
					class="group-card"
					animate:flip={{ duration: 250 }}
					out:slide={{ duration: 250 }}
				>
					<div class="group-head">
						<div class="group-kal" class:is-empty={!group.kalenjin.trim()}>
							{group.kalenjin.trim() || '(empty sentence)'}
						</div>
						<div class="group-head-right">
							<div class="group-count">{group.sentences.length} copies</div>
							<button
								type="button"
								class="btn ghost xs"
								aria-expanded={mergeKey === group.key}
								onclick={() => openMerge(group)}
							>
								{mergeKey === group.key ? 'Cancel merge' : 'Merge…'}
							</button>
							<form
								method="POST"
								action="?/deleteSentences"
								use:enhance={confirmSubmit(
									`Delete all ${group.sentences.length} copies in this group? In-use sentences will be skipped.`
								)}
							>
								{#each group.sentences as s (s.id)}
									<input type="hidden" name="ids" value={s.id} />
								{/each}
								<button
									type="submit"
									class="btn danger xs"
									disabled={groupDeletable.length === 0}
									title={groupDeletable.length === 0
										? 'All copies are sourced from a story'
										: `Delete all ${groupDeletable.length} deletable copies`}
								>
									Delete all
								</button>
							</form>
						</div>
					</div>
					<ul class="sentence-list">
						{#each group.sentences as sentence (sentence.id)}
							{@const lessonUse = sentence.lessonWords[0]}
							{@const storyLesson = sentence.storySentence?.story?.lesson}
							{@const fromStory = Boolean(sentence.storySentence)}
							{@const inUse = sentence.lessonWords.length > 0 || fromStory}
							{@const otherIds = group.sentences
								.filter((s) => s.id !== sentence.id)
								.map((s) => s.id)}
							{@const otherDeletableCount = group.sentences.filter(
								(s) => s.id !== sentence.id && !s.storySentence
							).length}
							<li
								class="sentence-row"
								animate:flip={{ duration: 250 }}
								out:slide={{ duration: 250 }}
							>
								<div class="sentence-body">
									<div class="kal" class:is-empty={!sentence.kalenjin.trim()}>
										<AudioPlayButton
											audioUrl={sentence.audioUrl}
											size="sm"
											label="Play sentence"
										/>
										<span>{sentence.kalenjin.trim() || '(empty)'}</span>
									</div>
									<div class="en" class:is-empty={!sentence.english.trim()}>
										{sentence.english.trim() || '(empty)'}
									</div>
									{#if sentence.notes}
										<div class="notes">{sentence.notes}</div>
									{/if}
									<div class="meta">
										<span>Added {formatDate(sentence.createdAt)}</span>
										<span>·</span>
										<span>{sentence._count.tokens} token{sentence._count.tokens === 1 ? '' : 's'}</span>
										{#if lessonUse}
											<span>·</span>
											<span class="tag tag-lesson">
												Lesson:
												<a href={`/lessons/${lessonUse.lessonSection.lesson.id}`}>
													{lessonUse.lessonSection.lesson.title}
												</a>
												{#if sentence.lessonWords.length > 1}
													<span class="extra">+{sentence.lessonWords.length - 1}</span>
												{/if}
											</span>
										{/if}
										{#if sentence.storySentence}
											<span>·</span>
											<span class="tag tag-story">
												Story: {sentence.storySentence.story.title}
												{#if storyLesson}
													(<a href={`/lessons/${storyLesson.id}`}>{storyLesson.title}</a>)
												{/if}
											</span>
										{/if}
										{#if !inUse}
											<span>·</span>
											<span class="tag tag-free">Not linked</span>
										{/if}
										{#if sentence.isUnique}
											<span>·</span>
											<span class="tag tag-unique">Marked unique</span>
										{/if}
									</div>
								</div>
								<div class="sentence-actions">
									<a class="btn ghost sm" href={`/corpus/${sentence.id}`}>Open</a>
									<form method="POST" action="?/toggleUnique" use:enhance>
										<input type="hidden" name="sentenceId" value={sentence.id} />
										<input
											type="hidden"
											name="isUnique"
											value={sentence.isUnique ? '0' : '1'}
										/>
										<button
											type="submit"
											class="btn ghost sm"
											class:is-on={sentence.isUnique}
											title={sentence.isUnique
												? 'Stop treating this sentence as intentionally unique'
												: 'Mark this sentence as intentionally unique so this spelling stops being flagged as a duplicate (a new unmarked copy still re-surfaces it)'}
										>
											{sentence.isUnique ? 'Unmark unique' : 'Mark unique'}
										</button>
									</form>
									<form
										method="POST"
										action="?/deleteSentences"
										use:enhance={confirmSubmit(
											'Delete this sentence? This cannot be undone.'
										)}
									>
										<input type="hidden" name="ids" value={sentence.id} />
										<button
											type="submit"
											class="btn danger sm"
											disabled={fromStory}
											title={fromStory
												? 'This sentence is sourced from a story and cannot be deleted here'
												: 'Delete this sentence'}
										>
											Delete
										</button>
									</form>
									<form
										method="POST"
										action="?/deleteSentences"
										use:enhance={confirmSubmit(
											`Delete the other ${otherIds.length} cop${otherIds.length === 1 ? 'y' : 'ies'}, keeping this sentence? In-use sentences will be skipped.`
										)}
									>
										{#each otherIds as otherId (otherId)}
											<input type="hidden" name="ids" value={otherId} />
										{/each}
										<button
											type="submit"
											class="btn danger sm outline"
											disabled={otherDeletableCount === 0}
											title={otherDeletableCount === 0
												? 'All other copies are sourced from a story'
												: `Delete ${otherDeletableCount} other cop${otherDeletableCount === 1 ? 'y' : 'ies'}, keep this one`}
										>
											Delete others
										</button>
									</form>
								</div>
							</li>
						{/each}
					</ul>

					{#if mergeKey === group.key}
						{@const englishOptions = distinct(group.sentences.map((s) => s.english))}
						{@const notesOptions = distinct(group.sentences.map((s) => s.notes))}
						{@const audioOptions = group.sentences.filter((s) => s.audioUrl)}
						{@const imageOptions = group.sentences.filter((s) => s.imageUrl)}
						{@const previewTarget =
							group.sentences.find((s) => s.id === mergeForm.targetId) ??
							group.sentences[0]}
						{@const previewAudio =
							group.sentences.find((s) => s.id === mergeForm.audioSourceId) ?? null}
						{@const previewImage =
							group.sentences.find((s) => s.id === mergeForm.imageSourceId) ?? null}
						<form
							class="merge-panel"
							method="POST"
							action="?/mergeSentences"
							use:enhance={confirmSubmit(
								'Merge this group? The non-kept copies will be deleted and folded into the kept sentence. Copies owned by a story or attached to another lesson are kept.'
							)}
						>
							<input type="hidden" name="key" value={group.key} />
							{#each group.sentences as s (s.id)}
								<input type="hidden" name="ids" value={s.id} />
							{/each}

							<div class="merge-fields">
								<div class="merge-field">
									<div class="merge-label">Keep this sentence</div>
								<div class="merge-options">
									{#each group.sentences as s (s.id)}
										<label class="merge-opt">
											<input
												type="radio"
												name="targetId"
												value={s.id}
												bind:group={mergeForm.targetId}
											/>
											<span class="merge-opt-text">
												{sentenceLabel(s)}
												{#if s.storySentence}<span class="mini tag-story">story</span>{/if}
												{#if s.lessonWords.length}<span class="mini tag-lesson">lesson</span>{/if}
												{#if s.audioUrl}<span class="mini">♪</span>{/if}
												{#if s.imageUrl}<span class="mini">🖼</span>{/if}
											</span>
										</label>
									{/each}
								</div>
							</div>

							<div class="merge-field">
								<div class="merge-label">English translation</div>
								<div class="merge-options">
									{#if englishOptions.length === 0}
										<label class="merge-opt">
											<input
												type="radio"
												name="english"
												value=""
												bind:group={mergeForm.english}
											/>
											<span class="merge-opt-text is-empty">(empty)</span>
										</label>
									{/if}
									{#each englishOptions as opt (opt)}
										<label class="merge-opt">
											<input
												type="radio"
												name="english"
												value={opt}
												bind:group={mergeForm.english}
											/>
											<span class="merge-opt-text">{opt}</span>
										</label>
									{/each}
								</div>
							</div>

							<div class="merge-field">
								<div class="merge-label">Notes</div>
								<div class="merge-options">
									<label class="merge-opt">
										<input
											type="radio"
											name="notes"
											value=""
											bind:group={mergeForm.notes}
										/>
										<span class="merge-opt-text is-empty">(no notes)</span>
									</label>
									{#each notesOptions as opt (opt)}
										<label class="merge-opt">
											<input
												type="radio"
												name="notes"
												value={opt}
												bind:group={mergeForm.notes}
											/>
											<span class="merge-opt-text">{opt}</span>
										</label>
									{/each}
								</div>
							</div>

							<div class="merge-field">
								<div class="merge-label">Audio</div>
								<input
									type="hidden"
									name="audioSourceId"
									value={mergeForm.audioSourceId}
								/>
								<div class="merge-options">
									{#if audioOptions.length < group.sentences.length}
										<button
											type="button"
											class="merge-opt"
											class:selected={mergeForm.audioSourceId === ''}
											onclick={() => (mergeForm.audioSourceId = '')}
										>
											<span class="merge-opt-text is-empty">No audio</span>
										</button>
									{/if}
									{#each audioOptions as s (s.id)}
										<!-- Capture-phase select so it runs before AudioPlayButton
										stops propagation: clicking the icon both picks this
										audio and plays it. -->
										<span
											class="audio-pick"
											class:selected={mergeForm.audioSourceId === s.id}
											use:captureClick={() => (mergeForm.audioSourceId = s.id)}
										>
											<AudioPlayButton audioUrl={s.audioUrl} size="sm" />
										</span>
									{/each}
								</div>
							</div>

							<div class="merge-field">
								<div class="merge-label">Image</div>
								<div class="merge-options">
									<label class="merge-opt">
										<input
											type="radio"
											name="imageSourceId"
											value=""
											bind:group={mergeForm.imageSourceId}
										/>
										<span class="merge-opt-text is-empty">No image</span>
									</label>
									{#each imageOptions as s (s.id)}
										<label class="merge-opt image-opt">
											<input
												type="radio"
												name="imageSourceId"
												value={s.id}
												bind:group={mergeForm.imageSourceId}
											/>
											<img class="img-thumb" src={s.imageUrl} alt="" />
										</label>
									{/each}
								</div>
							</div>
							</div>

							<div class="merge-preview">
								<div class="merge-label">Result preview</div>
								<div class="preview-row">
									<AudioPlayButton
										audioUrl={previewAudio?.audioUrl ?? null}
										size="sm"
										label="Play sentence"
									/>
									{#if previewTarget.tokens.length}
										<div class="preview-tokens">
											{#each previewTarget.tokens as t (t.id)}
												{@const lemma =
													t.word?.kalenjin ??
													t.segments
														.map((g) => g.word?.kalenjin)
														.filter(Boolean)
														.join(' + ')}
												<span class="ptok">
													<span class="ptok-surface">{t.surfaceForm}</span>
													{#if lemma}<span class="ptok-lemma">{lemma}</span>{/if}
													{#if t.inContextTranslation}
														<span class="ptok-ctx">{t.inContextTranslation}</span>
													{/if}
												</span>
											{/each}
										</div>
									{:else}
										<span class="preview-plain" class:is-empty={!previewTarget.kalenjin.trim()}>
											{previewTarget.kalenjin.trim() || '(empty)'}
										</span>
									{/if}
									<div class="preview-en" class:is-empty={!mergeForm.english}>
										{mergeForm.english || '(no translation)'}
									</div>
								</div>
								{#if mergeForm.notes}
									<div class="preview-notes">{mergeForm.notes}</div>
								{/if}
								{#if previewImage?.imageUrl}
									<img class="img-thumb" src={previewImage.imageUrl} alt="" />
								{/if}
							</div>

							<div class="merge-actions">
								<button type="submit" class="btn primary sm">Merge group</button>
								<button
									type="button"
									class="btn ghost sm"
									onclick={() => (mergeKey = null)}
								>
									Cancel
								</button>
							</div>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<ConfirmDialog
	open={confirmState !== null}
	title={confirmState?.title ?? ''}
	message={confirmState?.message ?? ''}
	confirmLabel={confirmState?.confirmLabel ?? 'Confirm'}
	variant={confirmState?.variant ?? 'primary'}
	onconfirm={onConfirmDialogConfirm}
	oncancel={onConfirmDialogCancel}
/>

<style>
	.duplicate-stats {
		display: flex;
		justify-content: flex-end;
		gap: 18px;
		margin: 0 0 10px;
		color: var(--ink-mute);
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.duplicate-stats div {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.duplicate-stats div + div {
		border-left: 1px solid var(--line);
		padding-left: 18px;
	}
	.duplicate-stats b {
		font-family: var(--font-display);
		font-size: 24px;
		line-height: 1;
		color: var(--ink);
		font-weight: 500;
	}

	.empty {
		padding: 40px;
		text-align: center;
		color: var(--ink-soft);
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
	}
	.empty p {
		margin: 0;
	}

	.group-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.group-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 10px 14px;
	}
	.duplicate-overview-card {
		padding-top: 12px;
		padding-bottom: 12px;
	}
	.duplicate-overview-card .duplicate-stats {
		margin: 0;
	}

	.group-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding-bottom: 6px;
		border-bottom: 1px solid var(--line-soft);
		margin-bottom: 4px;
	}
	.group-head-right {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.group-kal {
		font-family: var(--font-display);
		font-size: 15px;
		color: var(--ink);
	}
	.group-kal.is-empty,
	.kal.is-empty,
	.en.is-empty {
		color: var(--ink-mute);
		font-style: italic;
	}
	.group-count {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--ink-mute);
	}

	.sentence-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.sentence-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		padding: 6px 0;
		border-bottom: 1px solid var(--line-soft);
	}
	.sentence-row:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}

	.sentence-body {
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 10px;
		row-gap: 2px;
	}
	.sentence-body .kal {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 8px;
		font-family: var(--font-display);
		font-size: 14px;
		color: var(--ink);
	}
	.sentence-body .en {
		color: var(--ink-soft);
		font-size: 13px;
	}
	.sentence-body .notes {
		color: var(--ink-mute);
		font-size: 12px;
		font-style: italic;
	}

	.meta {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--ink-mute);
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		flex-basis: 100%;
	}
	.meta a {
		color: var(--brand);
		text-decoration: none;
	}
	.meta a:hover {
		text-decoration: underline;
	}

	.tag {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px 6px;
		border-radius: 999px;
		border: 1px solid var(--line);
	}
	.tag-lesson {
		background: color-mix(in oklch, var(--brand) 8%, transparent);
	}
	.tag-story {
		background: color-mix(in oklch, var(--accent, #d58b3a) 8%, transparent);
	}
	.tag-free {
		color: var(--ink-soft);
	}
	.tag-unique {
		background: color-mix(in oklch, var(--brand) 14%, transparent);
		border-color: color-mix(in oklch, var(--brand) 35%, transparent);
		color: var(--brand);
	}
	.btn.ghost.sm.is-on {
		background: color-mix(in oklch, var(--brand) 14%, transparent);
		border-color: color-mix(in oklch, var(--brand) 35%, transparent);
		color: var(--brand);
	}
	.tag .extra {
		color: var(--ink-mute);
	}

	.sentence-actions {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 4px;
	}

	.btn.danger {
		background: color-mix(in oklch, var(--danger, #c0392b) 15%, transparent);
		border-color: color-mix(in oklch, var(--danger, #c0392b) 40%, transparent);
		color: var(--danger, #c0392b);
	}
	.btn.danger:hover:not(:disabled) {
		background: color-mix(in oklch, var(--danger, #c0392b) 25%, transparent);
	}
	.btn.danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn.danger.outline {
		background: transparent;
	}
	.btn.xs {
		font-size: 11px;
		padding: 3px 8px;
	}

	.merge-panel {
		margin-top: 10px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: color-mix(in oklch, var(--brand) 5%, var(--bg-raised));
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.merge-fields {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
	}
	.merge-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1 1 0;
		min-width: 110px;
	}
	.merge-label {
		font-family: var(--font-mono);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-mute);
	}
	.merge-options {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 4px;
	}
	.merge-opt {
		position: relative;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		font-family: inherit;
		text-align: left;
		color: var(--ink);
		cursor: pointer;
		padding: 5px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--bg-raised);
		transition: border-color 0.12s, background 0.12s;
	}
	.merge-opt:hover {
		border-color: color-mix(in oklch, var(--brand) 40%, var(--line));
	}
	.merge-opt:has(input:checked),
	.merge-opt.selected {
		border-color: var(--brand);
		background: color-mix(in oklch, var(--brand) 12%, var(--bg-raised));
		box-shadow: inset 0 0 0 1px var(--brand);
	}
	.merge-opt input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
		appearance: none;
	}
	.merge-opt-text {
		overflow-wrap: anywhere;
	}
	.merge-opt-text.is-empty {
		color: var(--ink-mute);
		font-style: italic;
	}
	.audio-pick {
		display: inline-flex;
		align-self: flex-start;
		padding: 2px;
		border-radius: 999px;
		border: 1px solid transparent;
	}
	.audio-pick.selected {
		border-color: var(--brand);
		box-shadow: 0 0 0 2px color-mix(in oklch, var(--brand) 30%, transparent);
	}
	.img-thumb {
		width: 34px;
		height: 34px;
		object-fit: cover;
		border-radius: 4px;
		display: block;
	}
	.merge-preview {
		border: 1px solid color-mix(in oklch, var(--brand) 35%, var(--line));
		border-radius: var(--radius);
		background: var(--bg-raised);
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.preview-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.preview-tokens {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		flex: 1;
		min-width: 0;
	}
	.preview-plain {
		flex: 1;
		min-width: 0;
		font-family: var(--font-display);
		font-size: 14px;
		color: var(--ink);
	}
	.preview-plain.is-empty {
		color: var(--ink-mute);
		font-style: italic;
	}
	.ptok {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 3px 7px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: color-mix(in oklch, var(--brand) 4%, transparent);
		line-height: 1.25;
	}
	.ptok-surface {
		font-family: var(--font-display);
		font-size: 13px;
		color: var(--ink);
	}
	.ptok-lemma {
		font-size: 11px;
		color: var(--brand);
	}
	.ptok-ctx {
		font-size: 11px;
		color: var(--ink-soft);
		font-style: italic;
	}
	.preview-en {
		flex: none;
		max-width: 45%;
		text-align: right;
		color: var(--ink-soft);
		font-size: 13px;
	}
	.preview-en.is-empty {
		color: var(--ink-mute);
		font-style: italic;
	}
	.preview-notes {
		color: var(--ink-mute);
		font-size: 12px;
		font-style: italic;
	}
	.mini {
		font-family: var(--font-mono);
		font-size: 9px;
		padding: 0 5px;
		border-radius: 999px;
		border: 1px solid var(--line);
		color: var(--ink-soft);
	}
	.mini.tag-lesson {
		background: color-mix(in oklch, var(--brand) 8%, transparent);
	}
	.mini.tag-story {
		background: color-mix(in oklch, var(--accent, #d58b3a) 8%, transparent);
	}
	.merge-actions {
		display: flex;
		gap: 8px;
		padding-top: 2px;
	}

	@media (max-width: 720px) {
		.sentence-row {
			grid-template-columns: 1fr;
		}
		.sentence-actions {
			flex-direction: row;
			align-items: flex-start;
		}
	}
</style>
