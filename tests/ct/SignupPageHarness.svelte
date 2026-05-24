<script lang="ts">
	import SignupPage from '../../src/routes/signup/+page.svelte';

	type Props = {
		redirectTo?: string;
		formUsername?: string;
		formEmail?: string;
		formDisplayName?: string;
		formError?: string;
	};

	let {
		redirectTo = '',
		formUsername,
		formEmail,
		formDisplayName,
		formError
	}: Props = $props();

	let data = $derived({ user: null, redirectTo });
	let form = $derived(
		formUsername !== undefined ||
			formEmail !== undefined ||
			formDisplayName !== undefined ||
			formError !== undefined
			? {
					username: formUsername ?? '',
					email: formEmail ?? '',
					displayName: formDisplayName ?? '',
					error: formError ?? ''
				}
			: null
	);
</script>

<!-- eslint-disable-next-line svelte/valid-prop-names-in-kit-pages -->
<SignupPage data={data as never} form={form as never} />
