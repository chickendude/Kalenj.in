<script lang="ts">
	import AdminTranslationsPage from '../../src/routes/admin/translations/+page.svelte';

	type Props = {
		overrides?: { key: string; value: string }[];
	};

	let { overrides = [] }: Props = $props();

	const data = $derived({
		user: {
			id: 'u1',
			username: 'editor',
			displayName: null,
			role: 'ADMIN' as const,
			themePreference: 'auto' as const,
			statsFilterPreference: null
		},
		overrides
	});
</script>

<AdminTranslationsPage data={data as never} form={null as never} />
