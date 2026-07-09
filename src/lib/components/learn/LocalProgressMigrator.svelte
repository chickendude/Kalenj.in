<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import {
		clearLocalLearnData,
		hasLocalLearnData,
		loadLocalLearnData
	} from '$lib/learn/local-progress';
	import { toast } from '$lib/stores/toast.svelte';

	let { active }: { active: boolean } = $props();

	// One attempt per page load — a failure leaves the local data untouched so
	// the next visit retries. An $effect (client-only) rather than onMount so
	// it also fires when `active` flips on a client-side login redirect.
	let attempted = false;

	$effect(() => {
		if (!active || attempted || !hasLocalLearnData()) return;
		attempted = true;
		void migrate();
	});

	async function migrate() {
		try {
			const res = await fetch('/api/learn/migrate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(loadLocalLearnData())
			});
			if (!res.ok) return;
			clearLocalLearnData();
			toast.success('Your learning progress from this device is now on your account.', 5000);
			await invalidateAll();
		} catch {
			// Offline or transient failure — the local data stays and the next
			// signed-in page load tries again.
		}
	}
</script>
