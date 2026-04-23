<script lang="ts">
	import { goto } from '$app/navigation';

	type Target = {
		id: string;
		english: string;
		coveredByLessonWord: {
			id: string;
			kalenjin: string;
			lessonSection: {
				sectionOrder: number;
				lesson: { id: string; level: string; lessonOrder: number; title: string };
			};
		} | null;
	};

	type BuildUrlInput = {
		query?: string;
		sort?: 'alpha-asc' | 'alpha-desc';
		page?: number;
		coverage?: 'all' | 'covered' | 'uncovered';
		pos?: string[];
	};

	let {
		level,
		query,
		sort,
		coverageFilter,
		posFilters,
		posOptions,
		targets,
		page,
		totalPages,
		filteredCount,
		totalCount,
		coveredCount,
		buildUrl,
		replaceAction = null,
		replaceEnglishList = '',
		initialShowReplaceEditor = false,
		collapsible = false,
		expanded = $bindable(!collapsible)
	}: {
		level: string;
		query: string;
		sort: 'alpha-asc' | 'alpha-desc';
		coverageFilter: 'all' | 'covered' | 'uncovered';
		posFilters: string[];
		posOptions: { token: string; count: number }[];
		targets: Target[];
		page: number;
		totalPages: number;
		filteredCount: number;
		totalCount: number;
		coveredCount: number;
		buildUrl: (changes: BuildUrlInput) => string;
		replaceAction?: string | null;
		replaceEnglishList?: string;
		initialShowReplaceEditor?: boolean;
		collapsible?: boolean;
		expanded?: boolean;
	} = $props();

	let searchInput = $state('');
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let showReplaceEditor = $state(false);

	$effect(() => {
		if (initialShowReplaceEditor) {
			showReplaceEditor = true;
		}
	});

	$effect(() => {
		searchInput = query;
	});

	$effect(() => {
		const currentInput = searchInput;

		if (currentInput === query) {
			return;
		}

		if (searchDebounceTimer !== null) {
			clearTimeout(searchDebounceTimer);
		}

		searchDebounceTimer = setTimeout(() => {
			searchDebounceTimer = null;
			void navigateTo(buildUrl({ query: currentInput, page: 1 }));
		}, 250);

		return () => {
			if (searchDebounceTimer !== null) {
				clearTimeout(searchDebounceTimer);
				searchDebounceTimer = null;
			}
		};
	});

	async function navigateTo(url: string) {
		await goto(url, {
			invalidateAll: true,
			keepFocus: true,
			noScroll: true
		});
	}

	async function toggleSort() {
		const nextSort = sort === 'alpha-asc' ? 'alpha-desc' : 'alpha-asc';
		await navigateTo(buildUrl({ sort: nextSort, page: 1 }));
	}

	async function setCoverage(filter: 'all' | 'covered' | 'uncovered') {
		await navigateTo(buildUrl({ coverage: filter, page: 1 }));
	}

	async function togglePos(token: string) {
		const next = posFilters.includes(token) ? [] : [token];
		await navigateTo(buildUrl({ pos: next, page: 1 }));
	}

	async function goToPage(nextPage: number) {
		await navigateTo(buildUrl({ page: nextPage }));
	}
</script>

<aside class="side-card cefr-sidebar" aria-label="CEFR targets">
	<div class="cefr-sidebar-head">
		{#if collapsible}
			<button
				type="button"
				class="cefr-sidebar-toggle"
				aria-expanded={expanded}
				onclick={() => (expanded = !expanded)}
			>
				<div class="cefr-sidebar-title">
					<h3>{level} CEFR targets</h3>
					<p class="cefr-sidebar-summary">
						{totalCount} total · {coveredCount} covered
					</p>
				</div>
				<span class="cefr-sidebar-chevron" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
			</button>
		{:else}
			<div class="cefr-sidebar-title">
				<h3>{level} CEFR targets</h3>
				<p class="cefr-sidebar-summary">
					{totalCount} total · {coveredCount} covered
				</p>
			</div>
		{/if}
		{#if replaceAction && expanded}
			<button
				type="button"
				class="btn-sm ghost"
				onclick={() => (showReplaceEditor = !showReplaceEditor)}
			>
				{showReplaceEditor ? 'Close' : 'Replace list'}
			</button>
		{/if}
	</div>

	{#if expanded}
	{#if replaceAction && showReplaceEditor}
		<form method="POST" action={replaceAction} class="cefr-replace-form">
			<input type="hidden" name="level" value={level} />
			<input type="hidden" name="returnQuery" value={query} />
			<input type="hidden" name="returnSort" value={sort} />

			<div class="side-field">
				<label for="cefr-english-list">English references</label>
				<textarea
					id="cefr-english-list"
					class="side-textarea"
					name="englishList"
					rows="8"
					required
					placeholder="hello&#10;good morning&#10;to search"
				>{replaceEnglishList}</textarea>
				<small class="muted">
					One word or phrase per line. Saving replaces the entire {level} list.
				</small>
			</div>

			<div class="cefr-replace-actions">
				<button type="submit" class="btn-sm">Replace targets</button>
				<button
					type="button"
					class="btn-sm ghost"
					onclick={() => (showReplaceEditor = false)}
				>
					Cancel
				</button>
			</div>
		</form>
	{/if}

	<div class="side-field">
		<label for="cefr-search-input">Search</label>
		<div class="cefr-search-row">
			<input
				id="cefr-search-input"
				class="side-input"
				type="text"
				bind:value={searchInput}
				placeholder={`Filter ${level}`}
				aria-label={`Search ${level} targets`}
			/>
			<button
				type="button"
				class="cefr-chip sort-chip"
				onclick={toggleSort}
				aria-label="Toggle sort order"
			>
				{sort === 'alpha-asc' ? 'A–Z' : 'Z–A'}
			</button>
		</div>
	</div>

	<div class="side-field">
		<span class="cefr-filter-label">Coverage</span>
		<div class="cefr-chip-row">
			<button
				type="button"
				class="cefr-chip"
				class:active={coverageFilter === 'all'}
				aria-pressed={coverageFilter === 'all'}
				onclick={() => setCoverage('all')}
			>
				All
			</button>
			<button
				type="button"
				class="cefr-chip"
				class:active={coverageFilter === 'covered'}
				aria-pressed={coverageFilter === 'covered'}
				onclick={() => setCoverage('covered')}
			>
				Covered
			</button>
			<button
				type="button"
				class="cefr-chip"
				class:active={coverageFilter === 'uncovered'}
				aria-pressed={coverageFilter === 'uncovered'}
				onclick={() => setCoverage('uncovered')}
			>
				Uncovered
			</button>
		</div>
	</div>

	<div class="side-field">
		<span class="cefr-filter-label">Part of speech</span>
		<div class="cefr-chip-row">
			{#each posOptions as option}
				<button
					type="button"
					class="cefr-chip"
					class:active={posFilters.includes(option.token)}
					aria-pressed={posFilters.includes(option.token)}
					onclick={() => togglePos(option.token)}
				>
					{option.token}
					<span class="cefr-chip-count">{option.count}</span>
				</button>
			{/each}
		</div>
	</div>

	<p class="cefr-results-summary">
		Showing {targets.length} of {filteredCount}
		{#if query}
			for “{query}”
		{/if}
	</p>

	{#if targets.length === 0}
		<p class="cefr-empty">No targets found.</p>
	{:else}
		<ul class="cefr-target-list">
			{#each targets as target}
				{@const covered = target.coveredByLessonWord}
				<li>
					{#if covered}
						<a
							class="cefr-target cefr-target-covered"
							href={`/lessons/${covered.lessonSection.lesson.id}`}
							title={`${covered.lessonSection.lesson.level}.${covered.lessonSection.lesson.lessonOrder} section ${covered.lessonSection.sectionOrder}`}
						>
							<span class="en">{target.english}</span>
							<span class="kal">{covered.kalenjin}</span>
						</a>
					{:else}
						<span class="cefr-target cefr-target-uncovered">
							<span class="en">{target.english}</span>
						</span>
					{/if}
				</li>
			{/each}
		</ul>

		{#if totalPages > 1}
			<nav class="cefr-pagination">
				{#if page > 1}
					<a
						href={buildUrl({ page: page - 1 })}
						onclick={async (event) => {
							event.preventDefault();
							await goToPage(page - 1);
						}}
					>
						Previous
					</a>
				{:else}
					<span class="disabled">Previous</span>
				{/if}

				<span>Page {page} of {totalPages}</span>

				{#if page < totalPages}
					<a
						href={buildUrl({ page: page + 1 })}
						onclick={async (event) => {
							event.preventDefault();
							await goToPage(page + 1);
						}}
					>
						Next
					</a>
				{:else}
					<span class="disabled">Next</span>
				{/if}
			</nav>
		{/if}
	{/if}
	{/if}
</aside>

<style>
	.cefr-sidebar {
		align-content: start;
	}

	.cefr-sidebar-head {
		align-items: flex-start;
		display: flex;
		gap: 12px;
		justify-content: space-between;
		margin-bottom: 16px;
	}

	.cefr-sidebar-title h3 {
		margin: 0 0 4px;
	}

	.cefr-sidebar-toggle {
		align-items: flex-start;
		background: transparent;
		border: 0;
		color: inherit;
		cursor: pointer;
		display: flex;
		flex: 1;
		font: inherit;
		gap: 12px;
		justify-content: space-between;
		padding: 0;
		text-align: left;
	}

	.cefr-sidebar-chevron {
		color: var(--ink-mute);
		font-size: 11px;
		padding-top: 2px;
	}

	.cefr-sidebar-summary {
		color: var(--ink-soft);
		font-size: 12px;
		margin: 0;
	}

	.cefr-filter-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.cefr-search-row {
		align-items: stretch;
		display: flex;
		gap: 6px;
	}

	.cefr-search-row .side-input {
		flex: 1;
		min-width: 0;
	}

	.cefr-search-row .sort-chip {
		flex: 0 0 auto;
	}

	.cefr-chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.cefr-chip {
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--ink-soft);
		cursor: pointer;
		font-size: 12px;
		padding: 5px 10px;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}

	.cefr-chip:hover {
		border-color: var(--brand);
		color: var(--ink);
	}

	.cefr-chip.active {
		background: var(--brand);
		border-color: var(--brand);
		color: var(--on-brand);
	}

	.cefr-chip-count {
		color: inherit;
		font-size: 11px;
		margin-left: 4px;
		opacity: 0.7;
	}

	.sort-chip {
		font-variant-numeric: tabular-nums;
	}

	.cefr-replace-form {
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		margin-bottom: 16px;
		padding: 12px;
	}

	.cefr-replace-actions {
		display: flex;
		gap: 8px;
	}

	.cefr-results-summary {
		color: var(--ink-soft);
		font-size: 12px;
		margin: 0 0 10px;
	}

	.cefr-empty {
		color: var(--ink-soft);
		margin: 0;
	}

	.cefr-target-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.cefr-target {
		border-radius: 3px;
		display: inline-flex;
		font-size: 12px;
		gap: 6px;
		padding: 3px 8px;
		text-decoration: none;
	}

	.cefr-target-covered {
		background: color-mix(in oklch, var(--accent) 8%, transparent);
		border: 1px solid color-mix(in oklch, var(--accent) 35%, transparent);
		color: var(--ink);
	}

	.cefr-target-covered:hover {
		border-color: var(--accent);
		text-decoration: none;
	}

	.cefr-target-uncovered {
		background: transparent;
		border: 1px solid var(--line);
		color: var(--ink-mute);
	}

	.cefr-target .en {
		font-weight: 600;
	}

	.cefr-target-covered .kal {
		color: var(--ink-mute);
		font-family: var(--font-display);
	}

	.cefr-pagination {
		align-items: center;
		display: flex;
		gap: 0.75rem;
		margin-top: 14px;
	}

	.cefr-pagination .disabled {
		color: var(--ink-mute);
	}
</style>
