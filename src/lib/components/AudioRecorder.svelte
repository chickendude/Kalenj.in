<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { toast } from '$lib/stores/toast.svelte';

	type Props = {
		targetType: 'word' | 'sentence';
		targetId: string;
		currentAudioUrl: string | null | undefined;
	};

	let { targetType, targetId, currentAudioUrl }: Props = $props();

	type Mode = 'idle' | 'recording' | 'preview';
	let mode = $state<Mode>('idle');

	let mediaRecorder: MediaRecorder | null = null;
	let mediaStream: MediaStream | null = null;
	let recordedChunks: Blob[] = [];
	let recordingMimeType = 'audio/webm';
	let recordedBlob = $state<Blob | null>(null);
	let previewUrl = $state<string | null>(null);

	let isSaving = $state(false);
	let isRemoving = $state(false);
	let errorMessage = $state<string | null>(null);
	let confirmRemove = $state(false);

	let fileInput = $state<HTMLInputElement | null>(null);

	function clearPreview() {
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
			previewUrl = null;
		}
		recordedBlob = null;
		recordedChunks = [];
	}

	function stopStream() {
		if (mediaStream) {
			for (const track of mediaStream.getTracks()) track.stop();
			mediaStream = null;
		}
		mediaRecorder = null;
	}

	async function startRecording() {
		errorMessage = null;
		if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
			errorMessage = 'Recording is not supported in this browser.';
			return;
		}

		try {
			mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch (err) {
			errorMessage =
				err instanceof DOMException && err.name === 'NotAllowedError'
					? 'Microphone access was blocked. Allow it in the browser settings and try again.'
					: 'Could not access the microphone.';
			return;
		}

		const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
		recordingMimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

		try {
			mediaRecorder = recordingMimeType
				? new MediaRecorder(mediaStream, { mimeType: recordingMimeType })
				: new MediaRecorder(mediaStream);
		} catch {
			stopStream();
			errorMessage = 'Could not start the recorder.';
			return;
		}

		recordedChunks = [];
		mediaRecorder.ondataavailable = (event) => {
			if (event.data && event.data.size > 0) recordedChunks.push(event.data);
		};
		mediaRecorder.onstop = () => {
			const blob = new Blob(recordedChunks, {
				type: mediaRecorder?.mimeType || recordingMimeType || 'audio/webm'
			});
			stopStream();
			clearPreview();
			recordedBlob = blob;
			previewUrl = URL.createObjectURL(blob);
			mode = 'preview';
		};
		mediaRecorder.onerror = () => {
			stopStream();
			errorMessage = 'Recording failed. Please try again.';
			mode = 'idle';
		};

		mediaRecorder.start();
		mode = 'recording';
	}

	function stopRecording() {
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			mediaRecorder.stop();
		} else {
			stopStream();
			mode = 'idle';
		}
	}

	function cancelPreview() {
		clearPreview();
		mode = 'idle';
	}

	async function saveBlob(blob: Blob, fileName: string) {
		isSaving = true;
		errorMessage = null;
		try {
			const formData = new FormData();
			formData.append('file', blob, fileName);
			formData.append('targetType', targetType);
			formData.append('targetId', targetId);

			const res = await fetch('/api/audio/upload', { method: 'POST', body: formData });
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `Upload failed: ${res.status}`);
			}

			clearPreview();
			mode = 'idle';
			await invalidateAll();
			toast.success('Audio saved.');
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Could not save audio.';
		} finally {
			isSaving = false;
		}
	}

	async function savePreview() {
		if (!recordedBlob) return;
		const ext = recordingMimeType.includes('ogg') ? 'ogg' : recordingMimeType.includes('mp4') ? 'm4a' : 'webm';
		await saveBlob(recordedBlob, `recording.${ext}`);
	}

	async function handleFileInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		await saveBlob(file, file.name || 'upload');
	}

	async function removeAudio() {
		confirmRemove = false;
		isRemoving = true;
		errorMessage = null;
		try {
			const res = await fetch('/api/audio/delete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ targetType, targetId })
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `Delete failed: ${res.status}`);
			}
			await invalidateAll();
			toast.success('Audio removed.');
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Could not remove audio.';
		} finally {
			isRemoving = false;
		}
	}

	$effect(() => {
		return () => {
			stopStream();
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	});
</script>

<div class="audio-recorder">
	{#if currentAudioUrl && mode === 'idle'}
		<audio controls src={currentAudioUrl} preload="none"></audio>
		<div class="audio-actions">
			<button type="button" class="btn-sm" onclick={startRecording} disabled={isSaving || isRemoving}>
				Re-record
			</button>
			<button
				type="button"
				class="btn-sm ghost"
				onclick={() => fileInput?.click()}
				disabled={isSaving || isRemoving}
			>
				Replace with file
			</button>
			<button
				type="button"
				class="btn-sm danger"
				onclick={() => (confirmRemove = true)}
				disabled={isSaving || isRemoving}
			>
				Remove
			</button>
		</div>
	{:else if mode === 'idle'}
		<p class="audio-empty">No audio yet.</p>
		<div class="audio-actions">
			<button type="button" class="btn-sm" onclick={startRecording} disabled={isSaving}>
				Record
			</button>
			<button
				type="button"
				class="btn-sm ghost"
				onclick={() => fileInput?.click()}
				disabled={isSaving}
			>
				Upload file
			</button>
		</div>
	{:else if mode === 'recording'}
		<div class="audio-recording-indicator" role="status" aria-live="polite">
			<span class="audio-dot" aria-hidden="true"></span>
			Recording…
		</div>
		<div class="audio-actions">
			<button type="button" class="btn-sm" onclick={stopRecording}>Stop</button>
		</div>
	{:else if mode === 'preview'}
		{#if previewUrl}
			<audio controls src={previewUrl} preload="auto"></audio>
		{/if}
		<div class="audio-actions">
			<button type="button" class="btn-sm" onclick={savePreview} disabled={isSaving}>
				{isSaving ? 'Saving…' : 'Save'}
			</button>
			<button type="button" class="btn-sm ghost" onclick={startRecording} disabled={isSaving}>
				Re-record
			</button>
			<button type="button" class="btn-sm ghost" onclick={cancelPreview} disabled={isSaving}>
				Cancel
			</button>
		</div>
	{/if}

	{#if isSaving && mode !== 'preview'}
		<p class="audio-status">Saving…</p>
	{/if}
	{#if isRemoving}
		<p class="audio-status">Removing…</p>
	{/if}
	{#if errorMessage}
		<p class="audio-error">{errorMessage}</p>
	{/if}

	<input
		bind:this={fileInput}
		type="file"
		accept="audio/*"
		style="display: none"
		onchange={handleFileInput}
	/>
</div>

<ConfirmDialog
	open={confirmRemove}
	title="Remove audio?"
	message="The current recording will be deleted."
	confirmLabel="Remove"
	variant="danger"
	onconfirm={removeAudio}
	oncancel={() => (confirmRemove = false)}
/>

<style>
	.audio-recorder {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.audio-recorder audio {
		width: 100%;
	}
	.audio-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.audio-empty {
		color: var(--ink-mute);
		font-size: 13px;
		margin: 0;
	}
	.audio-status {
		color: var(--ink-mute);
		font-size: 13px;
		margin: 0;
	}
	.audio-error {
		color: var(--danger, #b91c1c);
		font-size: 13px;
		margin: 0;
	}
	.audio-recording-indicator {
		align-items: center;
		color: var(--ink-soft);
		display: flex;
		font-size: 14px;
		gap: 8px;
	}
	.audio-dot {
		background: #e11d48;
		border-radius: 50%;
		display: inline-block;
		height: 10px;
		width: 10px;
		animation: audio-pulse 1s ease-in-out infinite;
	}
	@keyframes audio-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.3; }
	}
	@media (prefers-reduced-motion: reduce) {
		.audio-dot { animation: none; }
	}
</style>
