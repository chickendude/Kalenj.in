<script lang="ts" generics="CefrTarget extends { id: string; level: string; english: string; coveredByLessonWordId: string | null }">
	import { suggestCefrTargets } from '$lib/cefr-suggestions';

	type LessonWord = {
		id: string;
		coveredCefrTargets: { id: string }[];
	};

	let {
		lessonId,
		lessonWord,
		translations,
		cefrTargets
	}: {
		lessonId: string;
		lessonWord: LessonWord;
		translations: string;
		cefrTargets: CefrTarget[];
	} = $props();

	let localTargetIds = $state<string[] | null>(null);
	let dismissed = $state<Set<string>>(new Set());
	let searchQuery = $state('');
	let searchOpen = $state(false);
	let errorMessage = $state('');

	const coveredIds = $derived(
		localTargetIds ?? lessonWord.coveredCefrTargets.map((target) => target.id)
	);
	const coveredIdSet = $derived(new Set(coveredIds));

	const covered = $derived(
		coveredIds
			.map((id) => cefrTargets.find((target) => target.id === id))
			.filter((target): target is CefrTarget => target !== undefined)
	);

	const suggestions = $derived(
		suggestCefrTargets(translations, cefrTargets, coveredIdSet).filter(
			(target) => !dismissed.has(target.id)
		)
	);

	const searchMatches = $derived.by(() => {
		const query = searchQuery.toLowerCase().trim();
		if (!query) return [];
		return cefrTargets.filter(
			(target) =>
				!coveredIdSet.has(target.id) &&
				(target.english.toLowerCase().includes(query) ||
					target.level.toLowerCase().includes(query))
		);
	});

	const searchResults = $derived(searchMatches.slice(0, 8));
	const searchResultCount = $derived(searchMatches.length);

	function isUsedByAnotherWord(target: CefrTarget) {
		return Boolean(
			target.coveredByLessonWordId && target.coveredByLessonWordId !== lessonWord.id
		);
	}

	function resetSearch() {
		searchQuery = '';
		searchOpen = false;
	}

	async function readError(response: Response): Promise<string> {
		try {
			const payload = (await response.json()) as { message?: string };
			return payload.message ?? 'Could not update CEFR targets.';
		} catch {
			return 'Could not update CEFR targets.';
		}
	}

	async function addTarget(targetId: string) {
		try {
			const response = await fetch(`/lessons/${lessonId}/cefr-target`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lessonWordId: lessonWord.id, targetId, action: 'add' })
			});
			if (!response.ok) {
				throw new Error(await readError(response));
			}
			localTargetIds = [...new Set([...coveredIds, targetId])];
			errorMessage = '';
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'Could not update CEFR targets.';
		}
	}

	async function removeTarget(targetId: string) {
		try {
			const response = await fetch(`/lessons/${lessonId}/cefr-target`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lessonWordId: lessonWord.id, targetId, action: 'remove' })
			});
			if (!response.ok) {
				throw new Error(await readError(response));
			}
			localTargetIds = coveredIds.filter((id) => id !== targetId);
			errorMessage = '';
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'Could not update CEFR targets.';
		}
	}

	function dismissSuggestion(targetId: string) {
		dismissed = new Set([...dismissed, targetId]);
	}
</script>

<div class="cefr-row">
	<span class="cefr-label">CEFR</span>
	<div class="cefr-pills">
		{#each covered as target}
			<span class="cefr-pill cefr-pill--covered">
				<span class="cefr-pill-level">{target.level}</span>
				{target.english}
				<button
					type="button"
					class="cefr-pill-btn"
					aria-label={`Remove ${target.level} ${target.english}`}
					title="Remove"
					onclick={() => void removeTarget(target.id)}
				>
					×
				</button>
			</span>
		{/each}

		{#each suggestions as suggestion}
			<span class="cefr-pill cefr-pill--suggest">
				<span class="cefr-pill-level">{suggestion.level}</span>
				{suggestion.english}
				<button
					type="button"
					class="cefr-pill-btn cefr-pill-btn--confirm"
					aria-label={`Confirm ${suggestion.level} ${suggestion.english}`}
					title="Confirm"
					onclick={() => void addTarget(suggestion.id)}
				>
					✓
				</button>
				<button
					type="button"
					class="cefr-pill-btn"
					aria-label={`Dismiss ${suggestion.level} ${suggestion.english}`}
					title="Dismiss"
					onclick={() => dismissSuggestion(suggestion.id)}
				>
					×
				</button>
			</span>
		{/each}

		<div class="cefr-search-wrap">
			<input
				type="text"
				class="cefr-search-input"
				placeholder="Search CEFR words..."
				value={searchQuery}
				autocomplete="off"
				oninput={(event) => {
					searchQuery = event.currentTarget.value;
					searchOpen = true;
				}}
				onfocus={() => (searchOpen = true)}
				onblur={() =>
					window.setTimeout(() => {
						searchOpen = false;
					}, 150)}
			/>
			{#if searchOpen && searchResults.length > 0}
				<ul class="cefr-search-dropdown">
					{#each searchResults as result}
						{@const used = isUsedByAnotherWord(result)}
						<li>
							<button
								type="button"
								class:cefr-search-result--used={used}
								disabled={used}
								title={used ? 'Already attached to another lesson word' : undefined}
								onmousedown={(event) => {
									event.preventDefault();
									if (used) return;
									void addTarget(result.id);
									resetSearch();
								}}
							>
								<span class="cefr-pill-level">{result.level}</span>
								<span class="cefr-search-result-text">{result.english}</span>
								{#if used}
									<span class="cefr-search-result-note">used</span>
								{/if}
							</button>
						</li>
					{/each}
					{#if searchResultCount > searchResults.length}
						<li class="cefr-search-more">
							...and {searchResultCount - searchResults.length} more
						</li>
					{/if}
				</ul>
			{/if}
		</div>
		{#if errorMessage}
			<p class="error-text cefr-error">{errorMessage}</p>
		{/if}
	</div>
</div>

<style>
	.cefr-row {
		align-items: start;
		display: grid;
		gap: 0.6rem;
		grid-template-columns: auto minmax(0, 1fr);
		padding: 0 0 0.5rem;
	}

	.cefr-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		padding-top: 0.3rem;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.cefr-pills {
		align-items: center;
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		gap: 0.35rem;
		min-width: 0;
	}

	.cefr-pill {
		align-items: center;
		background: color-mix(in oklch, var(--accent) 10%, transparent);
		border: 1px solid color-mix(in oklch, var(--accent) 35%, transparent);
		border-radius: 3px;
		color: var(--accent);
		display: inline-flex;
		flex: 0 1 auto;
		font-size: 11px;
		gap: 0.3rem;
		line-height: 1.2;
		max-width: 100%;
		min-width: 0;
		overflow-wrap: anywhere;
		padding: 2px 6px;
	}

	.cefr-pill--covered:hover {
		border-color: var(--accent);
	}

	.cefr-pill--suggest {
		background: color-mix(in oklch, var(--accent) 5%, transparent);
		border-color: color-mix(in oklch, var(--accent) 25%, transparent);
		border-style: dashed;
	}

	.cefr-pill-level {
		color: var(--ink-soft);
		font-weight: 600;
	}

	.cefr-pill-btn {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: 2px;
		color: var(--ink-mute);
		cursor: pointer;
		display: inline-flex;
		font-size: 0.85rem;
		height: 1.25rem;
		justify-content: center;
		line-height: 1;
		margin-left: 0.05rem;
		padding: 0;
		width: 1.25rem;
	}

	.cefr-pill-btn:hover {
		background: color-mix(in oklch, var(--ink) 8%, transparent);
		color: var(--ink);
	}

	.cefr-pill-btn--confirm {
		color: oklch(0.45 0.15 150);
	}

	.cefr-search-wrap {
		min-width: 12rem;
		position: relative;
	}

	.cefr-search-input {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-sizing: border-box;
		color: var(--ink);
		font-size: 0.85rem;
		padding: 0.3rem 0.55rem;
		transition: border-color 0.15s, box-shadow 0.15s;
		width: 100%;
	}

	.cefr-search-input:focus {
		border-color: var(--brand);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand) 18%, transparent);
		outline: none;
	}

	.cefr-search-dropdown {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 8px 24px -12px oklch(0.2 0.02 80 / 0.25);
		list-style: none;
		margin: 0.2rem 0 0;
		max-height: 12rem;
		overflow-y: auto;
		padding: 0;
		position: absolute;
		width: min(22rem, 80vw);
		z-index: 10;
	}

	.cefr-search-dropdown li button {
		align-items: center;
		background: transparent;
		border: 0;
		color: var(--ink);
		cursor: pointer;
		display: flex;
		gap: 0.45rem;
		padding: 0.4rem 0.55rem;
		text-align: left;
		width: 100%;
	}

	.cefr-search-dropdown li button:hover {
		background: var(--surface);
	}

	.cefr-search-dropdown li button:disabled {
		color: var(--ink-mute);
		cursor: not-allowed;
	}

	.cefr-search-dropdown li button:disabled:hover {
		background: transparent;
	}

	.cefr-search-result--used .cefr-search-result-text {
		text-decoration: line-through;
	}

	.cefr-search-result-note {
		color: var(--ink-mute);
		font-size: 0.8rem;
		margin-left: auto;
	}

	.cefr-search-more {
		color: var(--ink-mute);
		font-size: 0.82rem;
		padding: 0.35rem 0.55rem;
	}

	.error-text {
		color: var(--danger);
		margin: 0;
	}

	.cefr-error {
		flex-basis: 100%;
		font-size: 0.85rem;
		margin: 0;
	}

	@media (max-width: 800px) {
		.cefr-row {
			display: grid;
			grid-template-columns: 1fr;
		}
	}
</style>
