<script lang="ts">
	import { goto } from '$app/navigation';

	let { data, form } = $props();
	let showReplaceEditor = $state(false);
	let browseSort = $state('alpha-asc');

	$effect(() => {
		if (form?.error) {
			showReplaceEditor = true;
		}
	});

	$effect(() => {
		browseSort = data.sort;
	});

	function buildBrowseHref(page: number): string {
		return buildBrowseUrl(data.selectedLevel, data.query, data.sort, page);
	}

	function buildBrowseUrl(
		level: string,
		query: string,
		sort: string,
		page = 1
	): string {
		const params = new URLSearchParams();
		params.set('level', level);

		if (query) {
			params.set('q', query);
		}

		if (sort !== 'alpha-asc') {
			params.set('sort', sort);
		}

		if (page > 1) {
			params.set('page', String(page));
		}

		return `/cefr?${params.toString()}`;
	}

	async function navigateToBrowse(url: string) {
		await goto(url, {
			invalidateAll: true,
			keepFocus: true,
			noScroll: true
		});
	}

	async function handleBrowseSubmit(event: SubmitEvent) {
		event.preventDefault();

		const form = event.currentTarget as HTMLFormElement;
		const formData = new FormData(form);
		const params = new URLSearchParams();

		const level = String(formData.get('level') ?? '').trim();
		const query = String(formData.get('q') ?? '').trim();
		const sort = String(formData.get('sort') ?? '').trim();

		if (level) {
			params.set('level', level);
		}

		if (query) {
			params.set('q', query);
		}

		if (sort && sort !== 'alpha-asc') {
			params.set('sort', sort);
		}

		const url = params.toString() ? `/cefr?${params.toString()}` : '/cefr';
		await navigateToBrowse(url);
	}
</script>

<section>
	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	<section class="level-section">
		<div class="section-header">
			<h2>Browse targets</h2>
			<button type="button" class="secondary-button" onclick={() => (showReplaceEditor = !showReplaceEditor)}>
				{showReplaceEditor ? 'Close Replace List' : `Replace ${data.selectedLevel} List`}
			</button>
		</div>

		{#if showReplaceEditor}
			<form method="POST" action="?/create" class="editor-form replace-form">
				<h3>Replace {data.selectedLevel} targets</h3>
				<input type="hidden" name="level" value={data.selectedLevel} />
				<input type="hidden" name="returnQuery" value={data.query} />
				<input type="hidden" name="returnSort" value={data.sort} />

				<label>
					English references *
					<textarea
						name="englishList"
						rows="10"
						required
						placeholder="hello&#10;good morning&#10;to search"
					>{form?.values?.englishList ?? ''}</textarea>
					<small>
						Enter one word or phrase per line. Saving will replace the entire {data.selectedLevel}
						list.
					</small>
				</label>

				<div class="replace-actions">
					<button type="submit">Replace targets</button>
					<button type="button" class="secondary-button" onclick={() => (showReplaceEditor = false)}>
						Cancel
					</button>
				</div>
			</form>
		{/if}

		<div class="level-summary-grid">
			{#each data.levelSummaries as summary}
				<a
					class:selected={summary.level === data.selectedLevel}
					class="level-summary-card"
					href={buildBrowseUrl(summary.level, data.query, data.sort)}
					onclick={async (event) => {
						event.preventDefault();
						await navigateToBrowse(buildBrowseUrl(summary.level, data.query, data.sort));
					}}
				>
					<strong>{summary.level}</strong>
					<span>{summary.totalCount} total</span>
					<span>{summary.coveredCount} covered</span>
				</a>
			{/each}
		</div>

		<form method="GET" class="browse-form" onsubmit={handleBrowseSubmit}>
			<input type="hidden" name="level" value={data.selectedLevel} />
			<input type="hidden" name="sort" value={browseSort} />

			<label>
				Search {data.selectedLevel}
				<input name="q" value={data.query} placeholder="Filter within this level" />
			</label>

			<button
				type="button"
				class="secondary-button sort-button"
				onclick={async () => {
					const nextSort = data.sort === 'alpha-asc' ? 'alpha-desc' : 'alpha-asc';
					browseSort = nextSort;
					await navigateToBrowse(buildBrowseUrl(data.selectedLevel, data.query, nextSort));
				}}
			>
				{browseSort === 'alpha-asc' ? 'A-Z' : 'Z-A'}
			</button>

			<button type="submit">Apply</button>
		</form>

		<p class="results-summary">
			Showing {data.targets.length} of {data.totalCount} target(s) in {data.selectedLevel}
			{#if data.query}
				for “{data.query}”
			{/if}
			.
		</p>

		{#if data.targets.length === 0}
			<p>No targets found for this level and filter.</p>
		{:else}
			<ul class="target-list">
				{#each data.targets as target}
					<li>
						<div class="target-row">
							<form method="POST" action="?/update" class="target-form target-inline-form">
								<input type="hidden" name="id" value={target.id} />
								<input type="hidden" name="level" value={target.level} />
								<input type="hidden" name="returnQuery" value={data.query} />
								<input type="hidden" name="returnSort" value={data.sort} />
								<input name="english" value={target.english} required aria-label="English target" />

								<div class="row-actions">
									<button type="submit">Save</button>
								</div>
							</form>

							<form method="POST" action="?/delete" class="delete-form inline-delete-form">
								<input type="hidden" name="id" value={target.id} />
								<input type="hidden" name="level" value={target.level} />
								<input type="hidden" name="returnQuery" value={data.query} />
								<input type="hidden" name="returnSort" value={data.sort} />
								<button type="submit">Delete</button>
							</form>
						</div>

						<p class="coverage">
							{#if target.coveredByLessonWord}
								Covered by lesson {target.coveredByLessonWord.lessonSection.lesson.level}
								.{target.coveredByLessonWord.lessonSection.lesson.lessonOrder}, section
								{target.coveredByLessonWord.lessonSection.sectionOrder}:
								{target.coveredByLessonWord.word.kalenjin}
							{:else}
								Not covered yet.
							{/if}
						</p>
					</li>
				{/each}
			</ul>

			{#if data.totalPages > 1}
				<nav class="pagination">
					{#if data.page > 1}
						<a
							href={buildBrowseHref(data.page - 1)}
							onclick={async (event) => {
								event.preventDefault();
								await navigateToBrowse(buildBrowseHref(data.page - 1));
							}}
						>
							Previous
						</a>
					{:else}
						<span class="disabled">Previous</span>
					{/if}

					<span>Page {data.page} of {data.totalPages}</span>

					{#if data.page < data.totalPages}
						<a
							href={buildBrowseHref(data.page + 1)}
							onclick={async (event) => {
								event.preventDefault();
								await navigateToBrowse(buildBrowseHref(data.page + 1));
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
	</section>
</section>

<style>
	.error {
		color: #8c1c13;
		font-weight: 600;
	}

	.editor-form,
	.target-form {
		display: grid;
		gap: 0.75rem;
		max-width: 720px;
	}

	.editor-form {
		margin-bottom: 2rem;
	}

	.level-section {
		margin-top: 2rem;
	}

	.section-header {
		align-items: center;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.level-summary-grid {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		margin-bottom: 1rem;
	}

	.level-summary-card {
		border: 1px solid #e2e2e2;
		color: inherit;
		display: grid;
		gap: 0.2rem;
		padding: 0.85rem;
		text-decoration: none;
	}

	.level-summary-card.selected {
		border-color: #1d4ed8;
		background: #eff6ff;
	}

	.replace-form {
		border: 1px solid #e2e2e2;
		margin-bottom: 1rem;
		padding: 1rem;
	}

	.browse-form {
		align-items: end;
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1rem;
		max-width: 720px;
	}

	.browse-form label {
		flex: 1;
	}

	.sort-button {
		min-width: 4.5rem;
	}

	.target-list {
		display: grid;
		gap: 1rem;
		padding: 0;
	}

	.target-list li {
		list-style: none;
		border: 1px solid #e2e2e2;
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
	}

	label {
		display: grid;
		gap: 0.25rem;
	}

	input,
	textarea,
	button {
		font: inherit;
		padding: 0.45rem 0.5rem;
	}

	.secondary-button {
		background: #fff;
		border: 1px solid #d0d0d0;
	}

	small {
		color: #555;
	}

	.results-summary {
		color: #555;
	}

	.coverage {
		margin: 0;
		color: #555;
	}

	.delete-form {
		margin-top: 0.5rem;
	}

	.target-row {
		align-items: center;
		display: flex;
		gap: 0.75rem;
	}

	.target-inline-form {
		align-items: center;
		display: flex;
		flex: 1;
		gap: 0.75rem;
		max-width: none;
	}

	.target-inline-form input {
		flex: 1;
	}

	.row-actions {
		display: flex;
		gap: 0.5rem;
	}

	.inline-delete-form {
		margin-top: 0;
	}

	.replace-actions {
		display: flex;
		gap: 0.75rem;
	}

	.pagination {
		align-items: center;
		display: flex;
		gap: 1rem;
		margin-top: 1rem;
	}

	.disabled {
		color: #777;
	}
</style>
