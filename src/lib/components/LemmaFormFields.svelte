<script lang="ts">
	import { PART_OF_SPEECH_LABELS } from '$lib/parts-of-speech';
	import type { PartOfSpeech } from '@prisma/client';

	const CORE_POS = ['NOUN', 'ADJECTIVE', 'VERB'] as const satisfies readonly PartOfSpeech[];
	const OTHER_POS = [
		'ADVERB',
		'PRONOUN',
		'PREPOSITION',
		'CONJUNCTION',
		'INTERJECTION',
		'PHRASE',
		'OTHER'
	] as const satisfies readonly PartOfSpeech[];

	let {
		kalenjin = $bindable(''),
		translations = $bindable(''),
		alternativeSpellings = $bindable(''),
		notes = $bindable(''),
		partOfSpeech = $bindable<PartOfSpeech | ''>(''),
		pluralForm = $bindable(''),
		presentAnee = $bindable(''),
		presentInyee = $bindable(''),
		presentInee = $bindable(''),
		presentEchek = $bindable(''),
		presentOkwek = $bindable(''),
		presentIchek = $bindable(''),
		idPrefix = 'lemma',
		autofocusLemma = false,
		kalenjinLabel = 'Lemma',
		alternativeSpellingsHint = 'comma, separated'
	}: {
		kalenjin?: string;
		translations?: string;
		alternativeSpellings?: string;
		notes?: string;
		partOfSpeech?: PartOfSpeech | '';
		pluralForm?: string;
		presentAnee?: string;
		presentInyee?: string;
		presentInee?: string;
		presentEchek?: string;
		presentOkwek?: string;
		presentIchek?: string;
		idPrefix?: string;
		autofocusLemma?: boolean;
		kalenjinLabel?: string;
		alternativeSpellingsHint?: string;
	} = $props();

	let posOtherOpen = $state(false);
	let posOtherWrap = $state<HTMLDivElement | null>(null);

	const otherSelected = $derived(
		Boolean(partOfSpeech) && (OTHER_POS as readonly string[]).includes(partOfSpeech)
	);
	const needsPlural = $derived(partOfSpeech === 'NOUN' || partOfSpeech === 'ADJECTIVE');
	const needsConjugations = $derived(partOfSpeech === 'VERB');
	const needsAdditional = $derived(needsPlural || needsConjugations);

	$effect(() => {
		if (!posOtherOpen) {
			return;
		}

		function handlePointerDown(event: MouseEvent) {
			const wrap = posOtherWrap;
			if (!wrap) {
				return;
			}

			const target = event.target;
			if (target instanceof Node && wrap.contains(target)) {
				return;
			}

			posOtherOpen = false;
		}

		window.addEventListener('pointerdown', handlePointerDown, true);
		return () => window.removeEventListener('pointerdown', handlePointerDown, true);
	});

	function clearConjugations() {
		presentAnee = '';
		presentInyee = '';
		presentInee = '';
		presentEchek = '';
		presentOkwek = '';
		presentIchek = '';
	}

	function syncFormsToPos() {
		if (partOfSpeech !== 'NOUN' && partOfSpeech !== 'ADJECTIVE') {
			pluralForm = '';
		}
		if (partOfSpeech !== 'VERB') {
			clearConjugations();
		}
	}

	function togglePos(pos: PartOfSpeech) {
		partOfSpeech = partOfSpeech === pos ? '' : pos;
		syncFormsToPos();
		posOtherOpen = false;
	}

	function toggleOtherMenu() {
		if (otherSelected) {
			partOfSpeech = '';
			syncFormsToPos();
			posOtherOpen = false;
		} else {
			posOtherOpen = !posOtherOpen;
		}
	}

	function selectOtherPos(pos: PartOfSpeech) {
		partOfSpeech = partOfSpeech === pos ? '' : pos;
		syncFormsToPos();
		posOtherOpen = false;
	}
</script>

<div class="lemma-fields">
	<input type="hidden" name="partOfSpeech" value={partOfSpeech} />
	<input type="hidden" name="pluralForm" value={needsPlural ? pluralForm : ''} />
	<input type="hidden" name="presentAnee" value={needsConjugations ? presentAnee : ''} />
	<input type="hidden" name="presentInyee" value={needsConjugations ? presentInyee : ''} />
	<input type="hidden" name="presentInee" value={needsConjugations ? presentInee : ''} />
	<input type="hidden" name="presentEchek" value={needsConjugations ? presentEchek : ''} />
	<input type="hidden" name="presentOkwek" value={needsConjugations ? presentOkwek : ''} />
	<input type="hidden" name="presentIchek" value={needsConjugations ? presentIchek : ''} />

	<div class="pos-group">
		<span class="pos-group-label">Part of speech</span>
		<div class="pos-pills" role="radiogroup" aria-label="Part of speech">
			{#each CORE_POS as pos}
				{@const selected = partOfSpeech === pos}
				<button
					type="button"
					role="radio"
					aria-checked={selected}
					class="pos-pill"
					class:selected
					onclick={() => togglePos(pos)}
				>
					{PART_OF_SPEECH_LABELS[pos]}
				</button>
			{/each}
			<div class="pos-other-wrap" bind:this={posOtherWrap}>
				<button
					type="button"
					aria-pressed={otherSelected}
					aria-haspopup="menu"
					aria-expanded={posOtherOpen}
					class="pos-pill pos-pill-other"
					class:selected={otherSelected}
					onclick={toggleOtherMenu}
				>
					<span>
						{otherSelected
							? PART_OF_SPEECH_LABELS[partOfSpeech as PartOfSpeech]
							: 'Other'}
					</span>
					<span class="pos-pill-caret" aria-hidden="true">▾</span>
				</button>
				{#if posOtherOpen}
					<div class="pos-other-menu" role="menu">
						{#each OTHER_POS as pos}
							{@const itemSelected = partOfSpeech === pos}
							<button
								type="button"
								role="menuitemradio"
								aria-checked={itemSelected}
								class="pos-other-item"
								class:selected={itemSelected}
								onclick={() => selectOtherPos(pos)}
							>
								{PART_OF_SPEECH_LABELS[pos]}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<div class="lemma-form-grid">
		<div class="field">
			<label for="{idPrefix}-kalenjin">{kalenjinLabel}</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="{idPrefix}-kalenjin"
				class="input"
				name="kalenjin"
				required
				autofocus={autofocusLemma}
				bind:value={kalenjin}
			/>
		</div>
		<div class="field">
			<label for="{idPrefix}-alt">Alternative spellings</label>
			<input
				id="{idPrefix}-alt"
				class="input"
				name="alternativeSpellings"
				placeholder={alternativeSpellingsHint}
				bind:value={alternativeSpellings}
			/>
		</div>
	</div>

	{#if needsAdditional}
		<div class="lemma-forms-block">
			<div class="lemma-forms-head">
				<span class="lemma-forms-label">Additional Forms</span>
			</div>
			{#if needsPlural}
				<div class="field">
					<label for="{idPrefix}-plural">Plural</label>
					<input
						id="{idPrefix}-plural"
						class="input"
						placeholder="e.g. chego"
						bind:value={pluralForm}
					/>
				</div>
			{:else if needsConjugations}
				<div class="conjugation-sub">Present tense</div>
				<div class="conjugation-grid">
					<div class="field">
						<label for="{idPrefix}-anee">anee</label>
						<input
							id="{idPrefix}-anee"
							class="input"
							bind:value={presentAnee}
						/>
					</div>
					<div class="field">
						<label for="{idPrefix}-echek">echek</label>
						<input
							id="{idPrefix}-echek"
							class="input"
							bind:value={presentEchek}
						/>
					</div>
					<div class="field">
						<label for="{idPrefix}-inyee">inyee</label>
						<input
							id="{idPrefix}-inyee"
							class="input"
							bind:value={presentInyee}
						/>
					</div>
					<div class="field">
						<label for="{idPrefix}-okwek">okwek</label>
						<input
							id="{idPrefix}-okwek"
							class="input"
							bind:value={presentOkwek}
						/>
					</div>
					<div class="field">
						<label for="{idPrefix}-inee">inee</label>
						<input
							id="{idPrefix}-inee"
							class="input"
							bind:value={presentInee}
						/>
					</div>
					<div class="field">
						<label for="{idPrefix}-ichek">ichek</label>
						<input
							id="{idPrefix}-ichek"
							class="input"
							bind:value={presentIchek}
						/>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<div class="field lemma-full-field">
		<label for="{idPrefix}-translations">Translations</label>
		<input
			id="{idPrefix}-translations"
			class="input"
			name="translations"
			required
			placeholder="translation one; translation two"
			bind:value={translations}
		/>
	</div>

	<div class="field lemma-full-field">
		<label for="{idPrefix}-notes">Notes</label>
		<input
			id="{idPrefix}-notes"
			class="input"
			name="notes"
			placeholder="Optional"
			bind:value={notes}
		/>
	</div>
</div>

<style>
	.lemma-fields {
		display: block;
	}

	.field {
		display: grid;
		gap: 4px;
	}

	.field label {
		color: var(--ink);
		font-size: 12px;
		font-weight: 500;
	}

	.input {
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: 8px;
		color: var(--ink);
		font: inherit;
		padding: 8px 10px;
		width: 100%;
	}
	.input:focus {
		border-color: var(--brand);
		outline: 2px solid color-mix(in oklch, var(--brand) 30%, transparent);
		outline-offset: 1px;
	}

	.lemma-form-grid {
		display: grid;
		gap: 12px;
		grid-template-columns: 1fr 1fr;
	}

	.lemma-full-field {
		margin-top: 12px;
	}

	.lemma-forms-block {
		background: color-mix(in oklch, var(--accent) 10%, var(--paper));
		border: 1px solid color-mix(in oklch, var(--accent) 32%, var(--line));
		border-radius: 12px;
		margin-top: 12px;
		padding: 14px 16px;
	}
	.lemma-forms-head {
		margin-bottom: 10px;
	}
	.lemma-forms-label {
		color: var(--ink-soft);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.conjugation-sub {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.12em;
		margin-bottom: 8px;
		text-transform: uppercase;
	}
	.conjugation-grid {
		display: grid;
		gap: 10px 14px;
		grid-template-columns: 1fr 1fr;
	}
	.conjugation-grid .field label {
		font-family: var(--font-display, inherit);
		font-size: 13px;
		font-weight: 500;
		font-style: italic;
		letter-spacing: 0;
		text-transform: none;
	}
	.pos-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 14px;
		min-width: 0;
	}
	.pos-group-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.pos-pills {
		display: flex;
		flex-wrap: nowrap;
		gap: 8px;
	}
	.pos-pill {
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: 10px;
		color: var(--ink);
		cursor: pointer;
		flex: 1 1 0;
		font-size: 14px;
		font-weight: 500;
		min-width: 0;
		padding: 10px 14px;
		text-align: center;
		transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
		white-space: nowrap;
	}
	.pos-pill:hover {
		background: color-mix(in oklch, var(--brand) 8%, var(--paper));
		border-color: color-mix(in oklch, var(--brand) 32%, var(--line));
	}
	.pos-pill.selected {
		background: var(--brand);
		border-color: var(--brand);
		color: var(--paper);
	}
	.pos-pill.selected:hover {
		background: var(--brand);
		border-color: var(--brand);
	}

	.pos-other-wrap {
		flex: 1 1 0;
		min-width: 0;
		position: relative;
	}
	.pos-other-wrap .pos-pill {
		align-items: center;
		display: flex;
		gap: 6px;
		justify-content: center;
		width: 100%;
	}
	.pos-pill-caret {
		font-size: 10px;
		line-height: 1;
		opacity: 0.7;
	}
	.pos-other-menu {
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: 10px;
		box-shadow: var(--shadow-md);
		display: flex;
		flex-direction: column;
		left: 0;
		min-width: 100%;
		overflow: hidden;
		position: absolute;
		top: calc(100% + 6px);
		width: max-content;
		z-index: 2;
	}
	.pos-other-item {
		background: transparent;
		border: 0;
		color: var(--ink);
		cursor: pointer;
		font-size: 13px;
		padding: 8px 12px;
		text-align: left;
		white-space: nowrap;
	}
	.pos-other-item:hover {
		background: color-mix(in oklch, var(--brand) 10%, transparent);
	}
	.pos-other-item.selected {
		background: color-mix(in oklch, var(--brand) 16%, transparent);
		color: var(--brand-ink);
		font-weight: 600;
	}

	@media (max-width: 720px) {
		.lemma-form-grid,
		.conjugation-grid {
			grid-template-columns: 1fr;
		}
		.pos-pills {
			flex-wrap: wrap;
		}
	}
</style>
