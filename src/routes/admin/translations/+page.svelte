<script lang="ts">
	import { enhance } from '$app/forms';
	import FormErrorFeedback from '$lib/components/FormErrorFeedback.svelte';
	import { toast } from '$lib/stores/toast.svelte';
	import { en, type MessageKey } from '$lib/i18n/messages/en';
	import { kln } from '$lib/i18n/messages/kln';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let query = $state('');

	$effect(() => {
		if (form && 'saved' in form && form.saved) toast.success('Translation saved.');
	});
	$effect(() => {
		if (form && 'cleared' in form && form.cleared) toast.success('Override cleared.');
	});

	const SECTION_LABELS: Record<string, string> = {
		brand: 'Branding',
		nav: 'Navigation',
		menu: 'Menus',
		theme: 'Theme',
		language: 'Language',
		footer: 'Footer',
		search: 'Search',
		home: 'Home page',
		auth: 'Sign in',
		settings: 'Settings'
	};

	type Row = {
		key: MessageKey;
		english: string;
		dbValue: string | undefined;
		draftValue: string | undefined;
	};

	const dbMap = $derived(new Map(data.overrides.map((o) => [o.key, o.value])));

	const rows = $derived(
		(Object.entries(en) as [MessageKey, string][]).map(
			([key, english]): Row => ({
				key,
				english,
				dbValue: dbMap.get(key),
				draftValue: kln[key]
			})
		)
	);

	const translatedCount = $derived(rows.filter((row) => row.dbValue ?? row.draftValue).length);

	function matches(row: Row, needle: string): boolean {
		return (
			row.key.toLowerCase().includes(needle) ||
			row.english.toLowerCase().includes(needle) ||
			(row.dbValue ?? row.draftValue ?? '').toLowerCase().includes(needle)
		);
	}

	const sections = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		const grouped = new Map<string, Row[]>();
		for (const row of rows) {
			if (needle && !matches(row, needle)) continue;
			const prefix = row.key.split('.')[0];
			const section = grouped.get(prefix);
			if (section) {
				section.push(row);
			} else {
				grouped.set(prefix, [row]);
			}
		}
		return Array.from(grouped, ([prefix, sectionRows]) => ({
			label: SECTION_LABELS[prefix] ?? prefix,
			rows: sectionRows
		}));
	});

	function sourceOf(row: Row): 'site' | 'draft' | 'english' {
		if (row.dbValue !== undefined) return 'site';
		if (row.draftValue !== undefined) return 'draft';
		return 'english';
	}
</script>

<svelte:head>
	<title>Translations · Admin</title>
</svelte:head>

<div class="page-head">
	<div>
		<div class="page-kicker">Admin</div>
		<h1>Interface translations</h1>
		<p>
			Kalenjin text for menus, labels, and other interface messages. Anything left empty falls
			back to English. Clearing a field removes the edit made here; the code draft (if any) or
			the English text is used instead.
		</p>
	</div>
	<div class="page-stat">
		<b>{translatedCount}</b>
		of {rows.length} translated
	</div>
</div>

<FormErrorFeedback error={form && 'error' in form ? form.error : null} />

<div class="trans-toolbar">
	<input
		type="search"
		class="input"
		placeholder="Filter by key, English, or Kalenjin…"
		aria-label="Filter translations"
		bind:value={query}
	/>
</div>

{#each sections as section (section.label)}
	<section class="form-card trans-section">
		<h2>{section.label}</h2>
		<div class="trans-rows">
			{#each section.rows as row (row.key)}
				<div class="trans-row">
					<div class="trans-source">
						<code class="trans-key mono">{row.key}</code>
						<div class="trans-english">{row.english}</div>
					</div>
					<form method="POST" action="?/save" use:enhance class="trans-edit">
						<input type="hidden" name="key" value={row.key} />
						<input
							name="value"
							class="input"
							value={row.dbValue ?? row.draftValue ?? ''}
							placeholder={row.english}
							aria-label={`Kalenjin translation for ${row.key}`}
							autocomplete="off"
						/>
						<span class="trans-badge {sourceOf(row)}">
							{sourceOf(row) === 'site'
								? 'edited on site'
								: sourceOf(row) === 'draft'
									? 'code draft'
									: 'English'}
						</span>
						<button type="submit" class="btn-sm">Save</button>
					</form>
				</div>
			{/each}
		</div>
	</section>
{:else}
	<p class="muted">No messages match “{query.trim()}”.</p>
{/each}

<style>
	.trans-toolbar {
		margin: 0 0 16px;
		max-width: 420px;
	}
	.trans-section h2 {
		margin-bottom: 12px;
	}
	.trans-rows {
		display: flex;
		flex-direction: column;
	}
	.trans-row {
		display: grid;
		grid-template-columns: minmax(220px, 1fr) minmax(280px, 1.2fr);
		gap: 8px 20px;
		align-items: center;
		padding: 10px 0;
		border-top: 1px solid var(--line);
	}
	.trans-row:first-child {
		border-top: 0;
	}
	.trans-key {
		display: block;
		font-size: 11px;
		color: var(--ink-mute);
	}
	.trans-english {
		font-size: 14px;
	}
	.trans-edit {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.trans-edit .input {
		flex: 1;
		min-width: 0;
	}
	.trans-badge {
		flex-shrink: 0;
		font-size: 11px;
		color: var(--ink-mute);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 2px 8px;
		white-space: nowrap;
	}
	.trans-badge.site {
		color: var(--brand);
		border-color: color-mix(in oklch, var(--brand) 40%, transparent);
	}
	@media (max-width: 720px) {
		.trans-row {
			grid-template-columns: 1fr;
		}
	}
</style>
