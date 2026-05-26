<script lang="ts">
	let { href, label }: { href: string; label: string } = $props();
</script>

<a {href} class="back-link">
	<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
		<path
			d="M7.5 2L3 6l4.5 4"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
	{label}
</a>
