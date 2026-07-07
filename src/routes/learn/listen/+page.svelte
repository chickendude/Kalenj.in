<script lang="ts">
	import { enhance } from '$app/forms';
	import ListeningPlayer from '$lib/components/learn/ListeningPlayer.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import type { ActionData, PageData, SubmitFunction } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// --- Session settings (picker) -------------------------------------------
	let reps = $state(2);
	let kalenjinReps = $state(1);
	let shuffle = $state(false);
	let englishAudio = $state(true);
	// svelte-ignore state_referenced_locally — initialize from the URL once
	reps = data.settings.reps;
	// svelte-ignore state_referenced_locally — initialize from the URL once
	kalenjinReps = data.settings.kalenjinReps;
	// svelte-ignore state_referenced_locally — initialize from the URL once
	shuffle = data.settings.shuffle;
	// svelte-ignore state_referenced_locally — initialize from the URL once
	englishAudio = data.settings.englishAudio;

	const settingsQuery = $derived(
		`reps=${reps}&kreps=${kalenjinReps}&shuffle=${shuffle ? 1 : 0}&english=${englishAudio ? 1 : 0}`
	);

	// --- Playlist selection ---------------------------------------------------
	let playlistSelected = $state(new Set<string>());

	function togglePlaylist(id: string) {
		const next = new Set(playlistSelected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		playlistSelected = next;
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
	// svelte-ignore state_referenced_locally — initialize from saved program once
	if (data.mode === 'pick' && data.program) {
		programPattern = data.program.pattern;
		programSelected = new Set(data.program.lessonIds);
	}

	function toggleProgramLesson(id: string) {
		const next = new Set(programSelected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		programSelected = next;
	}

	const programSubmit: SubmitFunction = () => {
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
	<title>Listening practice · Learn</title>
</svelte:head>

{#if data.mode === 'play'}
	<div class="play-head">
		<div class="play-nav">
			<a class="exit" href="/learn" aria-label="Back to the course">✕</a>
			<a class="back-link" href="/learn/listen">← Change practice</a>
		</div>
		<h1 class="play-title">{data.title}</h1>
		<p class="play-hint">
			Hear the English, say it in Kalenjin, then listen and repeat —
			{data.scope === 'program' ? 'cycles per lesson follow your pattern' : `${data.settings.reps}× per sentence`}{data.settings.kalenjinReps > 1
				? `, Kalenjin ${data.settings.kalenjinReps}× per cycle`
				: ''}.
		</p>
		{#if data.scope === 'program' && data.programFinished}
			<p class="program-finished">
				Your program has worked through every lesson — add more lessons or restart it from the
				<a href="/learn/listen">practice picker</a>.
			</p>
		{/if}
	</div>
	<ListeningPlayer
		segments={data.segments}
		settings={data.settings}
		missedScope={data.scope === 'missed'}
		onSessionComplete={data.scope === 'program' ? completeProgramDay : null}
	/>
{:else}
	<div class="page-head">
		<div>
			<div class="page-kicker">Listening practice</div>
			<h1>Pick your practice</h1>
			<p>
				Glossika-style drilling: hear the English, say it in Kalenjin out loud, then listen to the
				Kalenjin and repeat.
			</p>
		</div>
	</div>

	{#if form?.error}
		<p class="form-feedback error">{form.error}</p>
	{/if}

	<section class="settings-panel">
		<h2 class="panel-title">Session settings</h2>
		<div class="settings-grid">
			<label class="setting">
				<span>Repetitions per sentence</span>
				<select class="select" bind:value={reps}>
					{#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as n (n)}
						<option value={n}>{n}×</option>
					{/each}
				</select>
			</label>
			<label class="setting">
				<span>Kalenjin plays per repetition</span>
				<select class="select" bind:value={kalenjinReps}>
					{#each [1, 2, 3] as n (n)}
						<option value={n}>{n}×</option>
					{/each}
				</select>
			</label>
			<label class="setting toggle">
				<input type="checkbox" bind:checked={shuffle} />
				<span>Random sentence order</span>
			</label>
			<label class="setting toggle">
				<input type="checkbox" bind:checked={englishAudio} />
				<span>Speak the English prompt (else show text)</span>
			</label>
		</div>
	</section>

	<section class="program-panel">
		<div class="program-head">
			<div>
				<h2 class="panel-title">Daily program</h2>
				{#if data.program}
					<p class="program-summary">
						Day {data.program.day} · pattern <span class="mono">{data.program.pattern}</span> ·
						{data.program.lessonTitles.length}
						{data.program.lessonTitles.length === 1 ? 'lesson' : 'lessons'}
						{#if data.program.finished}
							· <strong>finished</strong>
						{:else}
							· {data.program.todaySentenceCount} sentences today
						{/if}
					</p>
				{:else}
					<p class="program-summary">
						Glossika-style schedule: pick lessons and a pattern like
						<span class="mono">6 4 3 2</span> — each lesson enters a day apart and repeats fewer
						times as it ages.
					</p>
				{/if}
			</div>
			<div class="program-actions">
				{#if data.program && !data.program.finished && data.program.todaySentenceCount > 0}
					<a class="btn" href="/learn/listen?scope=program&{settingsQuery}">
						Start day {data.program.day}
					</a>
				{/if}
				<button type="button" class="btn-sm ghost" onclick={() => (programOpen = !programOpen)}>
					{data.program ? 'Edit program' : 'Set up a program'}
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
					<label for="program-pattern">Pattern (reps per day of age)</label>
					<input
						id="program-pattern"
						class="input mono"
						name="pattern"
						bind:value={programPattern}
						placeholder="6 4 3 2"
					/>
					<div class="pattern-presets">
						{#each ['6 4 3 2', '4 3 2 1', '3 2 1'] as preset (preset)}
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

				<fieldset class="program-lessons">
					<legend>Lessons, in the order they join the program</legend>
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
					{#if data.program}
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

	<a
		class="scope-card missed-card"
		class:disabled={data.missedCount === 0}
		href={data.missedCount > 0 ? `/learn/listen?scope=missed&${settingsQuery}` : undefined}
	>
		<span class="scope-title">Sentences you're missing</span>
		<span class="scope-detail">
			{data.missedCount > 0
				? `${data.missedCount} ${data.missedCount === 1 ? 'sentence' : 'sentences'} to master`
				: 'Nothing flagged — mark tricky sentences during practice'}
		</span>
	</a>

	{#each grouped as group (group.level)}
		<section class="scope-group">
			<div class="scope-group-head">
				<h2 class="scope-level">{group.level}</h2>
				{#if playlistSelected.size > 0}
					<a class="btn playlist-start" href={playlistHref}>
						▶ Start playlist ({playlistSelected.size})
					</a>
				{:else}
					<span class="playlist-hint">Tick lessons to build a playlist</span>
				{/if}
			</div>
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
		gap: 0.7rem 1.5rem;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
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

	.setting .select {
		width: auto;
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

	.pattern-presets {
		display: flex;
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

	.missed-card.disabled {
		border-color: var(--line);
		cursor: default;
		opacity: 0.7;
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
