<script lang="ts">
	import VerifyEmailPage from '../../src/routes/verify-email/+page.svelte';

	let { reason }: { reason: 'invalid' | 'expired' } = $props();
</script>

<VerifyEmailPage data={{ user: null, status: 'failed', reason } as never} />
