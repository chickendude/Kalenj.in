<script lang="ts">
	import {
		formatLessonType,
		formatPublishStatus,
		formatVocabularyLessonType
	} from '$lib/course';

	let { data, form } = $props();
</script>

<section>
	<h1>Lessons</h1>
	<p><a href="/">Back to home</a></p>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	<form method="POST" action="?/create" class="editor-form">
		<h2>Add lesson</h2>

		<label>
			Level *
			<select name="level" required value={form?.values?.level ?? 'A1'}>
				{#each data.levels as level}
					<option value={level}>{level}</option>
				{/each}
			</select>
		</label>

		<label>
			Title *
			<input name="title" required value={form?.values?.title ?? ''} />
		</label>

		<label>
			Lesson order *
			<input name="lessonOrder" type="number" min="1" required value={form?.values?.lessonOrder ?? ''} />
		</label>

		<label>
			Type *
			<select name="type" required value={form?.values?.type ?? 'VOCABULARY'}>
				{#each data.lessonTypes as type}
					<option value={type}>{formatLessonType(type)}</option>
				{/each}
			</select>
		</label>

		<label>
			Vocabulary type
			<select name="vocabularyType" value={form?.values?.vocabularyType ?? 'VOCAB'}>
				<option value="">Select...</option>
				{#each data.vocabularyTypes as type}
					<option value={type}>{formatVocabularyLessonType(type)}</option>
				{/each}
			</select>
		</label>

		<label>
			Status *
			<select name="status" required value={form?.values?.status ?? 'DRAFT'}>
				{#each data.publishStatuses as status}
					<option value={status}>{formatPublishStatus(status)}</option>
				{/each}
			</select>
		</label>

		<label>
			Story
			<select name="storyId" value={form?.values?.storyId ?? ''}>
				<option value="">Select...</option>
				{#each data.stories as story}
					<option value={story.id}>{story.title}</option>
				{/each}
			</select>
		</label>

		<label>
			Grammar markdown
			<textarea name="grammarMarkdown" rows="5">{form?.values?.grammarMarkdown ?? ''}</textarea>
		</label>

		<label>
			Notes
			<textarea name="notes" rows="4">{form?.values?.notes ?? ''}</textarea>
		</label>

		<button type="submit">Create lesson</button>
	</form>

	<h2>All lessons</h2>

	{#if data.lessons.length === 0}
		<p>No lessons yet.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Level</th>
					<th>Order</th>
					<th>Title</th>
					<th>Type</th>
					<th>Status</th>
					<th>Sections</th>
				</tr>
			</thead>
			<tbody>
				{#each data.lessons as lesson}
					<tr>
						<td>{lesson.level}</td>
						<td>{lesson.lessonOrder}</td>
						<td><a href={`/lessons/${lesson.id}`}>{lesson.title}</a></td>
						<td>
							{formatLessonType(lesson.type)}
							{#if lesson.vocabularyType}
								({formatVocabularyLessonType(lesson.vocabularyType)})
							{/if}
						</td>
						<td>{formatPublishStatus(lesson.status)}</td>
						<td>{lesson._count.sections}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.error {
		color: #8c1c13;
		font-weight: 600;
	}

	.editor-form {
		display: grid;
		gap: 0.75rem;
		max-width: 720px;
		margin-bottom: 2rem;
	}

	label {
		display: grid;
		gap: 0.25rem;
	}

	input,
	textarea,
	select,
	button {
		font: inherit;
		padding: 0.45rem 0.5rem;
	}

	table {
		border-collapse: collapse;
		width: 100%;
	}

	th,
	td {
		border-bottom: 1px solid #e2e2e2;
		padding: 0.5rem;
		text-align: left;
	}
</style>
