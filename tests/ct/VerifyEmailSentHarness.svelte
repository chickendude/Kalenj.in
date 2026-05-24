<script lang="ts">
	import VerifyEmailSentPage from '../../src/routes/verify-email/sent/+page.svelte';

	type Props = {
		dataEmail?: string;
		formEmail?: string;
		formResent?: boolean;
		formError?: string;
	};

	let { dataEmail = '', formEmail, formResent, formError }: Props = $props();

	let data = $derived({ user: null, email: dataEmail });
	let form = $derived(
		formEmail !== undefined || formResent !== undefined || formError !== undefined
			? { email: formEmail ?? '', resent: !!formResent, error: formError ?? '' }
			: null
	);
</script>

<VerifyEmailSentPage data={data as never} form={form as never} />
