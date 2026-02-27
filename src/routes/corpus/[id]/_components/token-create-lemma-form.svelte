<script lang="ts">
	type TokenDraft = {
		kalenjin: string;
		translations: string;
		notes: string;
	};

	type DraftField = keyof TokenDraft;

	type CreatableToken = {
		id: string;
		surfaceForm: string;
	};

	let {
		token,
		partIndex,
		defaultLemma,
		draft,
		creating = false,
		onDraftChange,
		onCreate
	} = $props<{
		token: CreatableToken;
		partIndex: number;
		defaultLemma: string;
		draft: TokenDraft;
		creating?: boolean;
		onDraftChange: (
			tokenId: string,
			defaultLemma: string,
			field: DraftField,
			value: string
		) => void;
		onCreate: (tokenId: string, defaultLemma: string) => void | Promise<void>;
	}>();

	function updateDraft(field: DraftField, event: Event): void {
		onDraftChange(token.id, defaultLemma, field, (event.currentTarget as HTMLInputElement).value);
	}
</script>

<div class="segment-block inline-form">
	<small>Create lemma for part {partIndex + 1} ("{token.surfaceForm}")</small>
	<input
		name="kalenjin"
		required
		placeholder="lemma"
		value={draft.kalenjin}
		oninput={(event) => updateDraft('kalenjin', event)}
	/>
	<input
		name="translations"
		required
		placeholder="translations"
		value={draft.translations}
		oninput={(event) => updateDraft('translations', event)}
	/>
	<input
		name="notes"
		placeholder="notes (optional)"
		value={draft.notes}
		oninput={(event) => updateDraft('notes', event)}
	/>
	<button type="button" disabled={creating} onclick={() => onCreate(token.id, defaultLemma)}>
		{creating ? 'Saving...' : 'Create + link part'}
	</button>
</div>

<style>
	.inline-form {
		display: grid;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}

	.segment-block {
		border-bottom: 1px dashed #ddd;
		margin-bottom: 0.6rem;
		padding-bottom: 0.6rem;
	}

	input,
	button {
		font: inherit;
		padding: 0.4rem 0.45rem;
	}
</style>
