<script lang="ts">
	import AdminTranslationsPage from '../../src/routes/admin/translations/+page.svelte';

	type Props = {
		translations?: Record<string, string>;
		canEdit?: boolean;
	};

	let { translations = {}, canEdit = true }: Props = $props();

	const data = $derived({
		user: {
			id: 'u1',
			username: 'editor',
			displayName: null,
			role: 'ADMIN' as const,
			themePreference: 'auto' as const,
			statsFilterPreference: null
		},
		translations,
		canEdit
	});
</script>

<AdminTranslationsPage data={data as never} form={null as never} />
