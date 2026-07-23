<script lang="ts">
	let {
		value = $bindable(''),
		suppress = false,
		auto = false
	}: {
		value?: string;
		suppress?: boolean;
		/** Lowercase everything automatically and offer to restore the typed capitals. */
		auto?: boolean;
	} = $props();

	const HAS_UPPERCASE = /\p{Lu}/u;

	// The text exactly as the user typed it, capitals preserved, so
	// "Restore capitals" brings back their original form.
	let original = $state('');
	let lastValue = '';
	let keptCapitals = $state(false);

	$effect(() => {
		if (!auto || suppress) return;
		if (value === '') {
			// The field was cleared; the next entry starts a fresh decision.
			original = '';
			lastValue = '';
			keptCapitals = false;
			return;
		}
		if (keptCapitals || value === lastValue) return;

		// Merge the user's latest edit into `original` by diffing against the
		// previous (lowercased) value. Lowercasing is length-preserving for
		// the alphabets in use, so positions line up 1:1.
		const prev = lastValue;
		let prefix = 0;
		while (prefix < prev.length && prefix < value.length && prev[prefix] === value[prefix]) {
			prefix += 1;
		}
		let prevEnd = prev.length;
		let nextEnd = value.length;
		while (prevEnd > prefix && nextEnd > prefix && prev[prevEnd - 1] === value[nextEnd - 1]) {
			prevEnd -= 1;
			nextEnd -= 1;
		}
		original = original.slice(0, prefix) + value.slice(prefix, nextEnd) + original.slice(prevEnd);

		const lowered = value.toLowerCase();
		if (lowered.length !== value.length) original = lowered; // unicode edge: stop tracking
		lastValue = lowered;
		if (lowered !== value) value = lowered;
	});

	const strippedCount = $derived.by(() => {
		if (original.length !== value.length) return 0;
		let count = 0;
		for (let i = 0; i < value.length; i += 1) {
			if (original[i] !== value[i]) count += 1;
		}
		return count;
	});
	const showAutoNote = $derived(auto && !suppress && !keptCapitals && strippedCount > 0);
	const showHint = $derived(!auto && !suppress && HAS_UPPERCASE.test(value));

	function lowercaseAll(event: MouseEvent) {
		value = value.toLowerCase();
		// Blur so a follow-up Enter submits the form instead of re-firing this button.
		(event.currentTarget as HTMLButtonElement).blur();
	}

	function restoreCapitals(event: MouseEvent) {
		value = original;
		keptCapitals = true;
		(event.currentTarget as HTMLButtonElement).blur();
	}
</script>

{#if showHint}
	<p class="capitalization-hint">
		Entries are usually lowercase — keep capitals only for proper names.
		<button type="button" class="hint-fix" onclick={lowercaseAll}>Make lowercase</button>
	</p>
{:else if showAutoNote}
	<p class="capitalization-hint" role="status">
		{strippedCount === 1 ? 'Lowercased 1 letter.' : `Lowercased ${strippedCount} letters.`}
		<button type="button" class="hint-fix" onclick={restoreCapitals}>Restore capitals</button>
	</p>
{/if}

<style>
	.capitalization-hint {
		margin: 4px 0 0;
		font-size: 0.8rem;
		color: var(--ink-mute);
	}

	.hint-fix {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		font-weight: 600;
		color: var(--accent);
		cursor: pointer;
	}

	.hint-fix:hover,
	.hint-fix:focus-visible {
		text-decoration: underline;
	}
</style>
