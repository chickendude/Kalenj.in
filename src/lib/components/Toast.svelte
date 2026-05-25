<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';
</script>

{#if toast.message}
	<div
		class="wod-toast"
		class:wod-toast-success={toast.variant === 'success'}
		class:wod-toast-error={toast.variant === 'error'}
		role={toast.variant === 'error' ? 'alert' : 'status'}
		aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
	>
		<span class="wod-toast-text">{toast.message}</span>
		<button
			type="button"
			class="wod-toast-close"
			onclick={() => toast.dismiss()}
			aria-label="Dismiss notification"
		>×</button>
	</div>
{/if}
