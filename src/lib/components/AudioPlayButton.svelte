<script lang="ts">
	type Props = {
		audioUrl: string | null | undefined;
		size?: 'md' | 'sm';
		label?: string;
	};

	let { audioUrl, size = 'md', label = 'Play pronunciation' }: Props = $props();

	let audio: HTMLAudioElement | null = null;
	let playing = $state(false);

	function handleClick(event: MouseEvent) {
		event.stopPropagation();
		event.preventDefault();
		if (!audioUrl) return;

		if (audio && !audio.paused) {
			audio.pause();
			audio.currentTime = 0;
			playing = false;
			return;
		}

		if (!audio || audio.src !== new URL(audioUrl, window.location.href).href) {
			audio = new Audio(audioUrl);
			audio.addEventListener('ended', () => {
				playing = false;
			});
			audio.addEventListener('pause', () => {
				playing = false;
			});
			audio.addEventListener('error', () => {
				playing = false;
			});
		}

		audio.currentTime = 0;
		audio.play().then(
			() => {
				playing = true;
			},
			() => {
				playing = false;
			}
		);
	}

	$effect(() => {
		return () => {
			if (audio) {
				audio.pause();
				audio = null;
			}
		};
	});
</script>

{#if audioUrl}
	<button
		type="button"
		class="audio-btn"
		class:sm={size === 'sm'}
		class:playing
		aria-label={label}
		aria-pressed={playing}
		onclick={handleClick}
	>
		{#if size === 'sm'}
			<svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true">
				<path d="M3 2l9 5-9 5V2z" fill="currentColor" />
			</svg>
		{:else}
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
				<path d="M3 2l9 5-9 5V2z" fill="currentColor" />
			</svg>
		{/if}
	</button>
{/if}

<style>
	.audio-btn {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 50%;
		color: var(--brand);
		cursor: pointer;
		display: inline-flex;
		flex-shrink: 0;
		height: 44px;
		justify-content: center;
		padding: 0;
		transition: transform 0.15s, background 0.15s, color 0.15s, border-color 0.15s;
		width: 44px;
	}
	.audio-btn:hover {
		background: var(--brand);
		color: var(--on-brand);
	}
	.audio-btn:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: 2px;
	}
	.audio-btn.sm {
		height: 28px;
		width: 28px;
	}
	.audio-btn.playing {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-brand);
	}
</style>
