<script lang="ts">
	import { enhance } from '$app/forms';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import ListeningPlayer from '$lib/components/learn/ListeningPlayer.svelte';
	import { parseProgramPattern, programDayPlan } from '$lib/learn/listening-program';
	import {
		localAdvanceListeningProgram,
		localDeleteListeningProgram,
		localListeningProgram,
		localMissedSentenceIds,
		localSaveListeningProgram,
		loadLocalLearnData
	} from '$lib/learn/local-progress';
	import { toast } from '$lib/stores/toast.svelte';
	import type { ActionData, PageData, SubmitFunction } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const REPS_COOKIE = 'listen_reps';

	// --- Signed-out (local) support --------------------------------------------
	// Missed sentences and the daily program live in localStorage; the server
	// only provides sentence/segment content via public JSON endpoints.
	type LocalSegment = {
		title: string | null;
		reps: number | null;
		sentences: Array<{ id: string; kalenjin: string; english: string; audioUrl: string }>;
	};

	type ProgramView = {
		pattern: string;
		day: number;
		lessonIds: string[];
		lessonTitles: string[];
		todaySentenceCount: number;
		todayRepetitions: number[];
		finished: boolean;
	};

	const needsLocalSegments = $derived(
		!data.user && data.mode === 'play' && (data.scope === 'missed' || data.scope === 'program')
	);

	let localSegments = $state<LocalSegment[] | null>(null);
	let localTitle = $state<string | null>(null);
	let localProgramFinished = $state(false);
	let localLoadFailed = $state(false);
	let localMissedCount = $state(0);
	let localProgramView = $state<ProgramView | null>(null);

	async function loadLocalMissed() {
		localLoadFailed = false;
		const sentenceIds = localMissedSentenceIds();
		if (sentenceIds.length === 0) {
			localSegments = [{ title: null, reps: null, sentences: [] }];
			return;
		}
		try {
			const res = await fetch('/api/learn/sentences', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sentenceIds })
			});
			if (!res.ok) throw new Error();
			const body = (await res.json()) as { sentences: LocalSegment['sentences'] };
			localSegments = [{ title: null, reps: null, sentences: body.sentences }];
		} catch {
			localLoadFailed = true;
		}
	}

	async function fetchSegmentsByLesson(
		lessonIds: string[]
	): Promise<Map<string, { title: string | null; sentences: LocalSegment['sentences'] }>> {
		const res = await fetch(`/api/learn/listening-segments?lessonIds=${lessonIds.join(',')}`);
		if (!res.ok) throw new Error();
		const body = (await res.json()) as {
			segments: Array<{
				lessonId?: string;
				title: string | null;
				sentences: LocalSegment['sentences'];
			}>;
		};
		return new Map(
			body.segments
				.filter((segment) => segment.lessonId)
				.map((segment) => [segment.lessonId!, segment])
		);
	}

	async function loadLocalProgramDay() {
		localLoadFailed = false;
		const program = localListeningProgram();
		if (!program) {
			localTitle = 'Daily program';
			localSegments = [];
			return;
		}
		const pattern = parseProgramPattern(program.pattern) ?? [];
		const plan = programDayPlan(program.lessonIds, program.currentDay, pattern);
		localTitle = `Daily program — day ${program.currentDay}`;
		localProgramFinished = plan.finished;
		if (plan.active.length === 0) {
			localSegments = [];
			return;
		}
		try {
			const byLesson = await fetchSegmentsByLesson(plan.active.map((entry) => entry.lessonId));
			localSegments = plan.active.flatMap((entry) => {
				const segment = byLesson.get(entry.lessonId);
				if (!segment || segment.sentences.length === 0) return [];
				return [
					{
						title: `${segment.title} — day ${entry.age}`,
						reps: entry.reps,
						sentences: segment.sentences
					}
				];
			});
		} catch {
			localLoadFailed = true;
		}
	}

	async function loadLocalProgramSummary() {
		const program = localListeningProgram();
		if (!program) {
			localProgramView = null;
			return;
		}
		const pattern = parseProgramPattern(program.pattern) ?? [];
		const titleById = new Map(
			data.mode === 'pick' ? data.options.map((option) => [option.id, option.title]) : []
		);
		const lessonIds = program.lessonIds.filter((id) => titleById.has(id));
		const plan = programDayPlan(lessonIds, program.currentDay, pattern);
		const view: ProgramView = {
			pattern: program.pattern,
			day: program.currentDay,
			lessonIds,
			lessonTitles: lessonIds.map((id) => titleById.get(id)!),
			todaySentenceCount: 0,
			todayRepetitions: [],
			finished: plan.finished
		};
		localProgramView = view;
		if (plan.active.length === 0) return;
		try {
			const byLesson = await fetchSegmentsByLesson(plan.active.map((entry) => entry.lessonId));
			for (const entry of plan.active) {
				const segment = byLesson.get(entry.lessonId);
				if (segment && segment.sentences.length > 0) {
					view.todaySentenceCount += segment.sentences.length;
					view.todayRepetitions.push(entry.reps);
				}
			}
			localProgramView = { ...view };
		} catch {
			// Counts stay at zero; the program summary still renders.
		}
	}

	// Runs on mount and again on same-route navigations (e.g. picker →
	// ?scope=program), where the component is reused and onMount wouldn't
	// re-fire. $effect never runs during SSR, so localStorage is available.
	$effect(() => {
		const { user, mode } = data;
		const scope = data.mode === 'play' ? data.scope : null;
		if (user) return;
		localSegments = null;
		localTitle = null;
		localProgramFinished = false;
		localLoadFailed = false;
		if (mode === 'play') {
			if (scope === 'missed') void loadLocalMissed();
			else if (scope === 'program') void loadLocalProgramDay();
		} else {
			localMissedCount = Object.keys(loadLocalLearnData().missedSentences).length;
			void loadLocalProgramSummary();
		}
	});

	// Server values for signed-in learners, localStorage for signed-out.
	const missedCount = $derived(
		data.mode === 'pick' ? (data.user ? data.missedCount : localMissedCount) : 0
	);
	const program = $derived(
		data.mode === 'pick' ? (data.user ? data.program : localProgramView) : null
	);

	// --- Session settings (picker) -------------------------------------------
	let reps = $state(1);
	let repeatKalenjin = $state(false);
	let shuffle = $state(false);
	// svelte-ignore state_referenced_locally — initialize from the URL once
	reps = data.settings.reps;
	// svelte-ignore state_referenced_locally — initialize from the URL once
	repeatKalenjin = data.settings.kalenjinReps > 1;
	// svelte-ignore state_referenced_locally — initialize from the URL once
	shuffle = data.settings.shuffle;

	const settingsQuery = $derived(
		`reps=${reps}&kreps=${repeatKalenjin ? 2 : 1}&shuffle=${shuffle ? 1 : 0}`
	);

	function adjustReps(delta: number) {
		reps = Math.min(9, Math.max(1, reps + delta));
	}

	function clampReps() {
		reps = Math.min(9, Math.max(1, Number(reps) || 1));
	}

	$effect(() => {
		if (data.mode !== 'pick') return;
		document.cookie = `${REPS_COOKIE}=${reps}; Path=/learn/listen; Max-Age=31536000; SameSite=Lax`;
	});

	// --- Playlist selection ---------------------------------------------------
	let playlistSelected = $state(new Set<string>());
	const playlistOptionSlugs = $derived(
		data.mode === 'pick' ? data.options.map((option) => option.slug) : []
	);
	const allPlaylistSelected = $derived(
		playlistOptionSlugs.length > 0 && playlistOptionSlugs.every((slug) => playlistSelected.has(slug))
	);

	function togglePlaylist(id: string) {
		const next = new Set(playlistSelected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		playlistSelected = next;
	}

	function toggleAllPlaylistLessons() {
		playlistSelected = allPlaylistSelected ? new Set() : new Set(playlistOptionSlugs);
	}

	const playlistHref = $derived(
		playlistSelected.size > 0
			? `/learn/listen?scope=playlist&lessonIds=${[...playlistSelected].join(',')}&${settingsQuery}`
			: null
	);

	// --- Program setup --------------------------------------------------------
	let programOpen = $state(false);
	let programPattern = $state('6 4 3 2');
	let programSelected = $state(new Set<string>());
	const programOptionIds = $derived(
		data.mode === 'pick' ? data.options.map((option) => option.id) : []
	);
	const allProgramSelected = $derived(
		programOptionIds.length > 0 && programOptionIds.every((id) => programSelected.has(id))
	);
	// svelte-ignore state_referenced_locally — initialize from saved program once
	if (data.mode === 'pick' && data.program) {
		programPattern = data.program.pattern;
		programSelected = new Set(data.program.lessonIds);
	}
	// Signed out, the saved program only exists client-side — seed the form
	// once it has been read from localStorage.
	$effect(() => {
		if (!data.user && localProgramView && !programOpen) {
			programPattern = localProgramView.pattern;
			programSelected = new Set(localProgramView.lessonIds);
		}
	});

	function toggleProgramLesson(id: string) {
		const next = new Set(programSelected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		programSelected = next;
	}

	function toggleAllProgramLessons() {
		programSelected = allProgramSelected ? new Set() : new Set(programOptionIds);
	}

	const programSubmit: SubmitFunction = ({ action, formData, cancel }) => {
		// Signed out: the program is saved to localStorage, not the server.
		if (!data.user) {
			cancel();
			if (action.search.includes('deleteProgram')) {
				localDeleteListeningProgram();
				toast.success('Program removed.');
				programOpen = false;
				void loadLocalProgramSummary();
				return;
			}
			const patternRaw = String(formData.get('pattern') ?? '').trim();
			if (!parseProgramPattern(patternRaw)) {
				toast.error('Pattern must be 1–10 numbers between 1 and 20, e.g. "6 4 3 2".', 4500);
				return;
			}
			const lessonIds = formData
				.getAll('lessonIds')
				.map((value) => String(value).trim())
				.filter(Boolean)
				.slice(0, 100);
			if (lessonIds.length === 0) {
				toast.error('Pick at least one lesson for the program.', 4500);
				return;
			}
			localSaveListeningProgram(patternRaw, lessonIds, formData.get('restart') === 'on');
			toast.success('Program saved.');
			programOpen = false;
			void loadLocalProgramSummary();
			return;
		}
		return async ({ result, update }) => {
			if (result.type === 'success') {
				toast.success((result.data as { success?: string } | undefined)?.success ?? 'Saved.');
				programOpen = false;
				await update({ invalidateAll: true });
			} else if (result.type === 'failure') {
				toast.error(
					(result.data as { error?: string } | undefined)?.error ?? 'Could not save.',
					4500
				);
			}
		};
	};

	// --- Program day completion (play mode) -----------------------------------
	async function completeProgramDay() {
		if (!data.user) {
			const currentDay = localAdvanceListeningProgram();
			toast.success(`Day complete! Tomorrow is day ${currentDay}.`, 4000);
			return;
		}
		try {
			const res = await fetch('/api/learn/listening-program/advance', { method: 'POST' });
			if (!res.ok) throw new Error();
			const body = (await res.json()) as { currentDay: number };
			toast.success(`Day complete! Tomorrow is day ${body.currentDay}.`, 4000);
		} catch {
			toast.error("Couldn't record the day as complete.", 4500);
		}
	}

	const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1'];

	const grouped = $derived.by(() => {
		if (data.mode !== 'pick') return [];
		const groups = new Map<string, typeof data.options>();
		for (const option of data.options) {
			const list = groups.get(option.level) ?? [];
			list.push(option);
			groups.set(option.level, list);
		}
		return LEVEL_ORDER.filter((level) => groups.has(level)).map((level) => ({
			level,
			options: groups.get(level)!
		}));
	});
</script>

<svelte:head>
	<title>Practice · Learn</title>
</svelte:head>

{#if data.mode === 'play'}
	<div class="play-head">
		<div class="play-nav">
			<a class="exit" href="/learn" aria-label="Back to the course">✕</a>
			<a class="back-link" href="/learn/listen">← Change practice</a>
		</div>
		<h1 class="play-title">{localTitle ?? data.title}</h1>
		<p class="play-hint">
			Hear the English, say it in Kalenjin, then listen and repeat —
			{data.scope === 'program' ? 'repetitions follow your program pattern' : `${data.settings.reps}× per sentence`}.
		</p>
		{#if data.scope === 'program' && (data.user ? data.programFinished : localProgramFinished)}
			<p class="program-finished">
				Your program has worked through every lesson — add more lessons or restart it from the
				<a href="/learn/listen">practice picker</a>.
			</p>
		{/if}
	</div>
	{#if needsLocalSegments}
		{#if localLoadFailed}
			<div class="local-load-error">
				<p>Couldn't load this practice. Check your connection.</p>
				<button
					type="button"
					class="btn"
					onclick={() =>
						void (data.scope === 'missed' ? loadLocalMissed() : loadLocalProgramDay())}
				>
					Try again
				</button>
			</div>
		{:else if localSegments}
			<ListeningPlayer
				segments={localSegments}
				settings={data.settings}
				missedScope={data.scope === 'missed'}
				local
				onSessionComplete={data.scope === 'program' ? completeProgramDay : null}
			/>
		{:else}
			<p class="local-loading">Loading your practice…</p>
		{/if}
	{:else}
		<ListeningPlayer
			segments={data.segments}
			settings={data.settings}
			missedScope={data.scope === 'missed'}
			local={!data.user}
			onSessionComplete={data.scope === 'program' ? completeProgramDay : null}
		/>
	{/if}
{:else}
	{#if form?.error}
		<p class="form-feedback error">{form.error}</p>
	{/if}

	<section class="settings-panel">
		<h2 class="panel-title">Session settings</h2>
		<div class="settings-grid">
			<div class="setting repetition-setting">
				<label for="sentence-reps">Reps per sentence</label>
				<span class="stepper">
					<button
						type="button"
						class="btn-sm ghost stepper-button"
						onclick={() => adjustReps(-1)}
						disabled={reps <= 1}
						aria-label="Decrease reps per sentence"
					>
						−
					</button>
					<input
						id="sentence-reps"
						class="stepper-input"
						type="number"
						min="1"
						max="9"
						bind:value={reps}
						oninput={clampReps}
						aria-label="Reps per sentence"
					/>
					<button
						type="button"
						class="btn-sm ghost stepper-button"
						onclick={() => adjustReps(1)}
						disabled={reps >= 9}
						aria-label="Increase reps per sentence"
					>
						+
					</button>
				</span>
			</div>
			<label class="setting repetition-setting">
				<span>Repeat Kalenjin?</span>
				<input type="checkbox" bind:checked={repeatKalenjin} />
			</label>
			<label class="setting toggle">
				<input type="checkbox" bind:checked={shuffle} />
				<Tooltip
					label="When enabled, the sentences will be shuffled before playing. Otherwise, they'll be played in the order they're presented in the lesson."
					placement="right"
				>
					<span>Random order</span>
				</Tooltip>
			</label>
		</div>
	</section>

	<section class="program-panel">
		<div class="program-head">
			<div>
				<h2 class="panel-title">Daily program</h2>
				{#if program}
					<p class="program-summary">
						Day {program.day} · pattern <span class="mono">{program.pattern}</span> ·
						{program.lessonTitles.length}
						{program.lessonTitles.length === 1 ? 'lesson' : 'lessons'}
						{#if program.finished}
							· <strong>finished</strong>
						{:else}
							· {program.todaySentenceCount} sentences today
						{/if}
					</p>
				{/if}
			</div>
			<div class="program-actions">
				{#if program && !program.finished && program.todaySentenceCount > 0}
					<a class="btn" href="/learn/listen?scope=program&{settingsQuery}">
						Start day {program.day}
					</a>
				{/if}
				<button type="button" class="btn-sm ghost" onclick={() => (programOpen = !programOpen)}>
					{program ? 'Edit program' : 'Set up a program'}
				</button>
			</div>
		</div>

		{#if programOpen}
			<form
				method="POST"
				action="?/saveProgram"
				use:enhance={programSubmit}
				class="program-form"
			>
				<div class="pattern-row">
					<label for="program-pattern">Pattern (reps per day)</label>
					<div class="pattern-controls">
						<input
							id="program-pattern"
							class="input mono"
							name="pattern"
							bind:value={programPattern}
							placeholder="6 4 3 2"
						/>
						<div class="pattern-presets">
							{#each ['6 4 3 2', '7 5 4 3 2'] as preset (preset)}
								<button
									type="button"
									class="btn-sm ghost"
									onclick={() => (programPattern = preset)}
								>
									{preset}
								</button>
							{/each}
						</div>
					</div>
				</div>

				<fieldset class="program-lessons">
					<legend>Lessons, in the order they join the program</legend>
					<label class="select-all-toggle program-select-all">
						<input
							type="checkbox"
							checked={allProgramSelected}
							onchange={toggleAllProgramLessons}
						/>
						<span>{allProgramSelected ? 'Clear all lessons' : 'Select all lessons'}</span>
					</label>
					{#each grouped as group (group.level)}
						{#each group.options as option (option.id)}
							<label class="lesson-check">
								<input
									type="checkbox"
									name="lessonIds"
									value={option.id}
									checked={programSelected.has(option.id)}
									onchange={() => toggleProgramLesson(option.id)}
								/>
								<span>
									{#if option.type === 'STORY'}📖{/if}
									{option.title}
									<span class="muted">({option.audioCount})</span>
								</span>
							</label>
						{/each}
					{/each}
				</fieldset>

				<div class="program-form-actions">
					{#if program}
						<label class="setting toggle">
							<input type="checkbox" name="restart" />
							<span>Restart from day 1</span>
						</label>
						<button
							type="submit"
							class="btn-sm ghost danger"
							formaction="?/deleteProgram"
						>
							Remove program
						</button>
					{/if}
					<button type="submit" class="btn-sm">Save program</button>
				</div>
			</form>
		{/if}
	</section>

	{#if missedCount > 0}
		<a class="scope-card missed-card" href={`/learn/listen?scope=missed&${settingsQuery}`}>
			<span class="scope-title">Problem sentences</span>
			<span class="scope-detail">
				{missedCount} {missedCount === 1 ? 'sentence' : 'sentences'} to master
			</span>
		</a>
	{/if}

	{#each grouped as group (group.level)}
		<section class="scope-group">
			<div class="scope-group-head">
				<h2 class="scope-level">{group.level}</h2>
				{#if playlistSelected.size > 0}
					<a class="btn playlist-start" href={playlistHref}>
						▶ Start playlist ({playlistSelected.size})
					</a>
				{:else}
					<span class="playlist-hint">Choose lessons for playlist</span>
				{/if}
			</div>
			<label class="select-all-toggle">
				<input
					type="checkbox"
					checked={allPlaylistSelected}
					onchange={toggleAllPlaylistLessons}
				/>
				<span>{allPlaylistSelected ? 'Clear all lessons' : 'Select all lessons'}</span>
			</label>
			<div class="scope-grid">
				{#each group.options as option (option.id)}
					<div class="scope-card" class:selected={playlistSelected.has(option.slug)}>
						<label class="playlist-check">
							<input
								type="checkbox"
								checked={playlistSelected.has(option.slug)}
								onchange={() => togglePlaylist(option.slug)}
								aria-label={`Add ${option.title} to playlist`}
							/>
						</label>
						<a
							class="scope-card-body"
							href="/learn/listen?scope={option.type === 'STORY' ? 'story' : 'lesson'}&lessonId={option.slug}&{settingsQuery}"
						>
							<span class="scope-title">
								{#if option.type === 'STORY'}📖{/if}
								{option.title}
							</span>
							<span class="scope-detail">
								{option.audioCount}
								{option.audioCount === 1 ? 'sentence' : 'sentences'} with audio
							</span>
						</a>
					</div>
				{/each}
			</div>
		</section>
	{:else}
		<p class="scope-empty">No lessons with recorded audio yet — check back soon.</p>
	{/each}
{/if}

<style>
	.play-head {
		display: grid;
		gap: 0.35rem;
		margin: 0 auto 1.4rem;
		max-width: 640px;
	}

	.play-nav {
		align-items: center;
		display: flex;
		gap: 0.8rem;
	}

	.exit {
		align-items: center;
		border: 1px solid var(--line);
		border-radius: 50%;
		color: var(--ink-mute);
		display: inline-flex;
		flex-shrink: 0;
		font-size: 14px;
		height: 34px;
		justify-content: center;
		text-decoration: none;
		width: 34px;
	}

	.exit:hover {
		background: var(--surface, var(--bg-raised));
		color: var(--ink);
	}

	.back-link {
		color: var(--ink-mute);
		font-size: 13px;
		text-decoration: none;
	}

	.back-link:hover {
		color: var(--ink);
		text-decoration: underline;
	}

	.play-title {
		font-family: var(--font-display, inherit);
		font-size: 1.6rem;
		margin: 0;
	}

	.play-hint {
		color: var(--ink-soft);
		font-size: 14px;
		margin: 0;
	}

	.program-finished {
		color: var(--accent);
		font-size: 14px;
		margin: 0;
	}

	.local-loading {
		color: var(--ink-mute);
		margin: 2rem auto;
		max-width: 640px;
		text-align: center;
	}

	.local-load-error {
		display: grid;
		gap: 0.8rem;
		justify-items: center;
		margin: 2rem auto;
		max-width: 640px;
		text-align: center;
	}

	.panel-title {
		font-family: var(--font-display, inherit);
		font-size: 1.05rem;
		margin: 0 0 0.5rem;
	}

	.settings-panel,
	.program-panel {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg, 10px);
		margin: 1.2rem 0;
		padding: 1rem 1.2rem;
	}

	.settings-grid {
		display: grid;
		gap: 0.7rem;
		grid-template-columns: minmax(0, max-content);
	}

	.setting {
		align-items: center;
		color: var(--ink-soft);
		display: flex;
		font-size: 14px;
		gap: 0.6rem;
		justify-content: space-between;
	}

	.setting.toggle {
		justify-content: flex-start;
	}

	.repetition-setting {
		display: grid;
		gap: 1rem;
		grid-template-columns: 12rem max-content;
		justify-content: start;
	}

	.stepper {
		align-items: center;
		display: inline-flex;
		gap: 0.35rem;
	}

	.stepper-button {
		align-items: center;
		display: inline-flex;
		height: 38px;
		justify-content: center;
		min-width: 2.25rem;
		padding-left: 0.65rem;
		padding-right: 0.65rem;
	}

	.stepper-input {
		appearance: textfield;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--ink);
		font: inherit;
		height: 38px;
		padding: 0 0.45rem;
		text-align: center;
		width: 3rem;
	}

	.stepper-input::-webkit-inner-spin-button,
	.stepper-input::-webkit-outer-spin-button {
		appearance: none;
		margin: 0;
	}

	.program-head {
		align-items: flex-start;
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		justify-content: space-between;
	}

	.program-summary {
		color: var(--ink-soft);
		font-size: 14px;
		margin: 0;
		max-width: 52ch;
	}

	.program-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.program-form {
		border-top: 1px solid var(--line);
		display: grid;
		gap: 1rem;
		margin-top: 1rem;
		padding-top: 1rem;
	}

	.pattern-row {
		display: grid;
		gap: 0.4rem;
		justify-items: start;
	}

	.pattern-row label {
		color: var(--ink-soft);
		font-size: 13px;
		font-weight: 500;
	}

	.pattern-row .input {
		max-width: 200px;
	}

	.pattern-controls {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.pattern-presets {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.program-lessons {
		border: 1px solid var(--line);
		border-radius: var(--radius, 6px);
		display: grid;
		gap: 0.35rem;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		padding: 0.7rem 0.9rem;
	}

	.program-lessons legend {
		color: var(--ink-soft);
		font-size: 13px;
		padding: 0 0.3rem;
	}

	.lesson-check {
		align-items: center;
		color: var(--ink);
		display: flex;
		font-size: 14px;
		gap: 0.45rem;
	}

	.select-all-toggle {
		align-items: center;
		color: var(--ink-soft);
		display: inline-flex;
		font-size: 13px;
		gap: 0.45rem;
	}

	.program-select-all {
		grid-column: 1 / -1;
	}

	.muted {
		color: var(--ink-mute);
	}

	.program-form-actions {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		justify-content: flex-end;
	}

	.danger {
		color: oklch(0.55 0.19 25);
	}

	.scope-group {
		margin-top: 1.6rem;
	}

	.scope-group-head {
		align-items: center;
		display: flex;
		gap: 1rem;
		justify-content: space-between;
		margin-bottom: 0.7rem;
	}

	.scope-level {
		font-family: var(--font-display, inherit);
		font-size: 1.05rem;
		margin: 0;
	}

	.playlist-hint {
		color: var(--ink-mute);
		font-size: 12.5px;
	}

	.scope-grid {
		display: grid;
		gap: 0.7rem;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
	}

	.scope-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg, 10px);
		display: flex;
		gap: 0.6rem;
		padding: 0.9rem 1.1rem;
		text-decoration: none;
		transition: border-color 0.15s, transform 0.15s;
	}

	a.scope-card {
		display: grid;
		gap: 0.2rem;
	}

	.scope-card:hover:not(.disabled) {
		border-color: var(--brand);
		transform: translateY(-1px);
	}

	.scope-card.selected {
		border-color: var(--brand);
	}

	.playlist-check {
		align-items: flex-start;
		display: flex;
		padding-top: 0.15rem;
	}

	.scope-card-body {
		display: grid;
		gap: 0.2rem;
		text-decoration: none;
	}

	.scope-card-body:hover .scope-title {
		text-decoration: underline;
	}

	.missed-card {
		border-color: var(--accent);
		margin-bottom: 0.4rem;
	}

	.scope-title {
		color: var(--ink);
		font-weight: 600;
	}

	.scope-detail {
		color: var(--ink-mute);
		font-size: 13px;
	}

	.scope-empty {
		color: var(--ink-mute);
		margin-top: 1.5rem;
	}
</style>
