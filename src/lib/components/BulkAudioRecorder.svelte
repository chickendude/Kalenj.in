<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/stores/toast.svelte';

	type WordItem = {
		id: string;
		kalenjin: string;
		translations: string;
	};

	type Props = {
		words: WordItem[];
	};

	let { words }: Props = $props();

	type SessionState =
		| { kind: 'idle' }
		| { kind: 'priming'; targetWordId: string }
		| { kind: 'speaking'; targetWordId: string; startedAt: number }
		| { kind: 'waiting'; targetWordId: string }
		| { kind: 'finishing' }
		| { kind: 'processing' }
		| { kind: 'reviewing' }
		| { kind: 'saving' }
		| { kind: 'discarding' }
		| { kind: 'done'; saved: number }
		| { kind: 'undoing' }
		| { kind: 'undone'; count: number }
		| { kind: 'error'; message: string };

	type Segment = {
		wordId: string;
		startMs: number;
		endMs: number;
	};

	type ResultRow = {
		wordId: string;
		audioUrl: string;
		durationSec: number | null;
	};

	type SkippedRow = {
		wordId: string;
		reason: string;
	};

	type WordStatus = 'pending' | 'current' | 'captured' | 'skipped';

	const SILENCE_RMS = 0.012;
	const SPEAKING_RMS = 0.04;
	const SILENCE_HOLD_MS = 900;
	const MAX_WORD_MS = 6000;
	const MIN_WORD_MS = 200;
	const ANALYSER_FFT = 2048;
	const LEAD_IN_MS = 180;
	const TAIL_MS = 220;

	let session = $state<SessionState>({ kind: 'idle' });
	let level = $state(0);
	let segments = $state<Segment[]>([]);
	let skippedSet = $state<Set<string>>(new Set());
	let resultRows = $state<ResultRow[]>([]);
	let processingSkipped = $state<SkippedRow[]>([]);
	let reviewSelected = $state<Set<string>>(new Set());
	let savedRows = $state<ResultRow[]>([]);
	let playingWordId = $state<string | null>(null);
	let playSequence: string[] = [];
	let playSequenceIndex = 0;
	let confirmUndo = $state(false);
	let skipPromptId = $state<string | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);
	let audioEls: Map<string, HTMLAudioElement> = new Map();

	let mediaStream: MediaStream | null = null;
	let mediaRecorder: MediaRecorder | null = null;
	let audioContext: AudioContext | null = null;
	let analyserNode: AnalyserNode | null = null;
	let analyserBuffer: Float32Array<ArrayBuffer> | null = null;
	let recordedChunks: Blob[] = [];
	let recordingMimeType = '';
	let recordingStartTs = 0;
	let lastVoicedTs = 0;
	let rafHandle: number | null = null;

	const wordById = $derived(new Map(words.map((w) => [w.id, w])));
	const totalWords = $derived(words.length);
	const segmentByWordId = $derived(new Map(segments.map((s) => [s.wordId, s])));
	const capturedCount = $derived(segments.length);
	const skippedCount = $derived(skippedSet.size);
	const completedCount = $derived(capturedCount + skippedCount);
	const progressPct = $derived(
		totalWords === 0 ? 0 : Math.round((completedCount / totalWords) * 100)
	);
	const targetWordId = $derived.by(() => {
		if (
			session.kind === 'priming' ||
			session.kind === 'speaking' ||
			session.kind === 'waiting'
		) {
			return session.targetWordId;
		}
		return null;
	});
	const currentWord = $derived(targetWordId ? (wordById.get(targetWordId) ?? null) : null);
	const nextWord = $derived.by(() => {
		if (!targetWordId) return null;
		const idx = words.findIndex((w) => w.id === targetWordId);
		for (let i = idx + 1; i < words.length; i += 1) {
			const w = words[i];
			if (!segmentByWordId.has(w.id) && !skippedSet.has(w.id)) return w;
		}
		return null;
	});
	const isActive = $derived(
		session.kind === 'speaking' || session.kind === 'waiting' || session.kind === 'priming'
	);
	const meterPct = $derived(Math.min(100, Math.round((level / 0.3) * 100)));
	const aboveSpeaking = $derived(level >= SPEAKING_RMS);

	function statusOf(wordId: string): WordStatus {
		if (segmentByWordId.has(wordId)) return 'captured';
		if (skippedSet.has(wordId)) return 'skipped';
		if (targetWordId === wordId) return 'current';
		return 'pending';
	}

	function findNextPendingId(): string | null {
		for (const w of words) {
			if (!segmentByWordId.has(w.id) && !skippedSet.has(w.id)) return w.id;
		}
		return null;
	}

	function teardown() {
		if (rafHandle !== null) {
			cancelAnimationFrame(rafHandle);
			rafHandle = null;
		}
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			try {
				mediaRecorder.stop();
			} catch {
				// ignore
			}
		}
		mediaRecorder = null;
		if (mediaStream) {
			for (const track of mediaStream.getTracks()) track.stop();
			mediaStream = null;
		}
		if (audioContext) {
			audioContext.close().catch(() => undefined);
			audioContext = null;
		}
		analyserNode = null;
		analyserBuffer = null;
	}

	function tick() {
		rafHandle = null;
		if (!analyserNode || !analyserBuffer) return;
		analyserNode.getFloatTimeDomainData(analyserBuffer);
		let sumSq = 0;
		for (let i = 0; i < analyserBuffer.length; i += 1) {
			const sample = analyserBuffer[i];
			sumSq += sample * sample;
		}
		const rms = Math.sqrt(sumSq / analyserBuffer.length);
		level = rms;

		const now = performance.now();
		const elapsedMs = now - recordingStartTs;

		if (session.kind === 'priming') {
			if (rms >= SPEAKING_RMS) {
				const startedAt = Math.max(0, elapsedMs - LEAD_IN_MS);
				lastVoicedTs = elapsedMs;
				session = {
					kind: 'speaking',
					targetWordId: session.targetWordId,
					startedAt
				};
			}
		} else if (session.kind === 'speaking') {
			if (rms >= SILENCE_RMS) {
				lastVoicedTs = elapsedMs;
			}
			const silenceFor = elapsedMs - lastVoicedTs;
			const spokenFor = elapsedMs - session.startedAt;
			if (spokenFor > MAX_WORD_MS) {
				captureSegment(session.targetWordId, session.startedAt, elapsedMs + TAIL_MS);
			} else if (silenceFor >= SILENCE_HOLD_MS && spokenFor >= SILENCE_HOLD_MS + MIN_WORD_MS) {
				captureSegment(session.targetWordId, session.startedAt, lastVoicedTs + TAIL_MS);
			}
		} else if (session.kind === 'waiting') {
			if (rms >= SPEAKING_RMS) {
				const startedAt = Math.max(0, elapsedMs - LEAD_IN_MS);
				lastVoicedTs = elapsedMs;
				session = {
					kind: 'speaking',
					targetWordId: session.targetWordId,
					startedAt
				};
			}
		}

		if (isActive) {
			rafHandle = requestAnimationFrame(tick);
		}
	}

	function captureSegment(wordId: string, startMs: number, endMs: number) {
		const safeEnd = Math.max(startMs + MIN_WORD_MS, endMs);
		const filtered = segments.filter((s) => s.wordId !== wordId);
		segments = [...filtered, { wordId, startMs, endMs: safeEnd }];
		advanceToNext();
	}

	function advanceToNext() {
		const nextId = findNextPendingId();
		if (nextId) {
			session = { kind: 'waiting', targetWordId: nextId };
		} else {
			void completeAndUpload();
		}
	}

	async function startSession() {
		if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
			session = { kind: 'error', message: 'Recording is not supported in this browser.' };
			return;
		}
		segments = [];
		skippedSet = new Set();
		recordedChunks = [];
		resultRows = [];
		processingSkipped = [];
		level = 0;

		try {
			mediaStream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: true, noiseSuppression: true }
			});
		} catch (err) {
			session = {
				kind: 'error',
				message:
					err instanceof DOMException && err.name === 'NotAllowedError'
						? 'Microphone access was blocked. Allow it in your browser settings and try again.'
						: 'Could not access the microphone.'
			};
			return;
		}

		const preferredTypes = [
			'audio/webm;codecs=opus',
			'audio/webm',
			'audio/ogg;codecs=opus',
			'audio/mp4'
		];
		recordingMimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

		try {
			mediaRecorder = recordingMimeType
				? new MediaRecorder(mediaStream, { mimeType: recordingMimeType })
				: new MediaRecorder(mediaStream);
		} catch {
			teardown();
			session = { kind: 'error', message: 'Could not start the recorder.' };
			return;
		}

		mediaRecorder.ondataavailable = (event) => {
			if (event.data && event.data.size > 0) recordedChunks.push(event.data);
		};
		mediaRecorder.onerror = () => {
			teardown();
			session = { kind: 'error', message: 'Recording failed. Please try again.' };
		};

		try {
			const Ctor =
				window.AudioContext ??
				(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			audioContext = new Ctor();
			const source = audioContext.createMediaStreamSource(mediaStream);
			analyserNode = audioContext.createAnalyser();
			analyserNode.fftSize = ANALYSER_FFT;
			analyserNode.smoothingTimeConstant = 0.4;
			analyserBuffer = new Float32Array(new ArrayBuffer(analyserNode.fftSize * 4));
			source.connect(analyserNode);
		} catch {
			teardown();
			session = { kind: 'error', message: 'Could not analyse the microphone input.' };
			return;
		}

		recordingStartTs = performance.now();
		mediaRecorder.start();
		const firstId = words[0]?.id;
		if (!firstId) {
			teardown();
			session = { kind: 'error', message: 'No words to record.' };
			return;
		}
		session = { kind: 'priming', targetWordId: firstId };
		rafHandle = requestAnimationFrame(tick);
	}

	function requestSkip(wordId: string) {
		skipPromptId = wordId;
	}

	function confirmSkip() {
		const wordId = skipPromptId;
		skipPromptId = null;
		if (!wordId) return;
		const next = new Set(skippedSet);
		next.add(wordId);
		skippedSet = next;
		const filtered = segments.filter((s) => s.wordId !== wordId);
		if (filtered.length !== segments.length) segments = filtered;
		if (targetWordId === wordId) advanceToNext();
		if (!isActive) return;
		ensureLoop();
	}

	function restoreWord(wordId: string) {
		if (!skippedSet.has(wordId)) return;
		const next = new Set(skippedSet);
		next.delete(wordId);
		skippedSet = next;
		if (isActive) {
			session = { kind: 'waiting', targetWordId: wordId };
			ensureLoop();
		}
	}

	function redoWord(wordId: string) {
		if (!isActive) return;
		const filtered = segments.filter((s) => s.wordId !== wordId);
		if (filtered.length !== segments.length) segments = filtered;
		const next = new Set(skippedSet);
		if (next.has(wordId)) {
			next.delete(wordId);
			skippedSet = next;
		}
		session = { kind: 'waiting', targetWordId: wordId };
		ensureLoop();
	}

	function ensureLoop() {
		if (rafHandle === null && isActive) {
			rafHandle = requestAnimationFrame(tick);
		}
	}

	function stopEarly() {
		if (session.kind === 'speaking') {
			const now = performance.now() - recordingStartTs;
			captureSegment(
				session.targetWordId,
				session.startedAt,
				Math.max(session.startedAt + MIN_WORD_MS, now) + TAIL_MS
			);
			return;
		}
		void completeAndUpload();
	}

	async function completeAndUpload() {
		if (!mediaRecorder) return;
		session = { kind: 'finishing' };
		const stopped = new Promise<void>((resolveStop) => {
			if (!mediaRecorder) {
				resolveStop();
				return;
			}
			mediaRecorder.onstop = () => resolveStop();
			try {
				mediaRecorder.stop();
			} catch {
				resolveStop();
			}
		});
		await stopped;

		if (rafHandle !== null) {
			cancelAnimationFrame(rafHandle);
			rafHandle = null;
		}

		if (segments.length === 0) {
			teardown();
			session = { kind: 'error', message: 'No words were recorded.' };
			return;
		}

		session = { kind: 'processing' };

		const blob = new Blob(recordedChunks, {
			type: recordingMimeType || 'audio/webm'
		});
		const ext = recordingMimeType.includes('ogg')
			? 'ogg'
			: recordingMimeType.includes('mp4')
				? 'm4a'
				: 'webm';
		const formData = new FormData();
		formData.append('file', blob, `bulk.${ext}`);
		formData.append(
			'segments',
			JSON.stringify(segments.map((s) => ({ wordId: s.wordId, startMs: s.startMs, endMs: s.endMs })))
		);

		try {
			const res = await fetch('/api/audio/bulk', { method: 'POST', body: formData });
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `Processing failed: ${res.status}`);
			}
			const payload = (await res.json()) as { results: ResultRow[]; skipped: SkippedRow[] };
			resultRows = payload.results;
			processingSkipped = payload.skipped;
			reviewSelected = new Set(payload.results.map((r) => r.wordId));
			session = { kind: 'reviewing' };
		} catch (err) {
			session = {
				kind: 'error',
				message: err instanceof Error ? err.message : 'Could not process audio.'
			};
		} finally {
			teardown();
		}
	}

	function toggleReviewSelected(wordId: string) {
		const next = new Set(reviewSelected);
		if (next.has(wordId)) next.delete(wordId);
		else next.add(wordId);
		reviewSelected = next;
	}

	function selectAllReview() {
		reviewSelected = new Set(resultRows.map((r) => r.wordId));
	}

	function selectNoneReview() {
		reviewSelected = new Set();
	}

	async function saveSelected() {
		stopPlayback();
		const keep = resultRows.filter((r) => reviewSelected.has(r.wordId));
		const discard = resultRows.filter((r) => !reviewSelected.has(r.wordId)).map((r) => r.audioUrl);
		if (keep.length === 0) {
			void discardAll();
			return;
		}
		session = { kind: 'saving' };
		try {
			const res = await fetch('/api/audio/bulk/commit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					keep: keep.map((r) => ({ wordId: r.wordId, audioUrl: r.audioUrl })),
					discard
				})
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `Save failed: ${res.status}`);
			}
			const payload = (await res.json()) as {
				committed: { wordId: string; audioUrl: string }[];
			};
			const committedIds = new Set(payload.committed.map((c) => c.wordId));
			savedRows = keep.filter((r) => committedIds.has(r.wordId));
			session = { kind: 'done', saved: savedRows.length };
			toast.success(
				`Saved ${savedRows.length} word${savedRows.length === 1 ? '' : 's'}.`
			);
			await invalidateAll();
		} catch (err) {
			session = {
				kind: 'error',
				message: err instanceof Error ? err.message : 'Could not save audio.'
			};
		}
	}

	async function discardAll() {
		stopPlayback();
		const urls = resultRows.map((r) => r.audioUrl);
		if (urls.length === 0) {
			session = { kind: 'idle' };
			return;
		}
		session = { kind: 'discarding' };
		try {
			await fetch('/api/audio/bulk/commit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ keep: [], discard: urls })
			});
			resultRows = [];
			reviewSelected = new Set();
			session = { kind: 'idle' };
			toast.success('Recording discarded.');
		} catch (err) {
			session = {
				kind: 'error',
				message: err instanceof Error ? err.message : 'Could not discard audio.'
			};
		}
	}

	function playRow(wordId: string) {
		const el = audioEls.get(wordId);
		if (!el) return;
		stopPlayback();
		playingWordId = wordId;
		el.currentTime = 0;
		el.onended = () => {
			if (playingWordId === wordId) playingWordId = null;
		};
		el.play().catch(() => {
			playingWordId = null;
		});
	}

	function playAll() {
		stopPlayback();
		const ids = resultRows
			.filter((r) => reviewSelected.has(r.wordId))
			.map((r) => r.wordId);
		if (ids.length === 0) return;
		playSequence = ids;
		playSequenceIndex = 0;
		playNextInSequence();
	}

	function playNextInSequence() {
		if (playSequenceIndex >= playSequence.length) {
			playingWordId = null;
			playSequence = [];
			return;
		}
		const wordId = playSequence[playSequenceIndex];
		const el = audioEls.get(wordId);
		if (!el) {
			playSequenceIndex += 1;
			playNextInSequence();
			return;
		}
		playingWordId = wordId;
		el.currentTime = 0;
		el.onended = () => {
			playSequenceIndex += 1;
			playNextInSequence();
		};
		el.play().catch(() => {
			playSequenceIndex += 1;
			playNextInSequence();
		});
	}

	function stopPlayback() {
		if (playingWordId) {
			const el = audioEls.get(playingWordId);
			if (el) {
				try {
					el.pause();
					el.onended = null;
				} catch {
					// ignore
				}
			}
		}
		playingWordId = null;
		playSequence = [];
		playSequenceIndex = 0;
	}

	async function undoSession() {
		confirmUndo = false;
		if (savedRows.length === 0) return;
		session = { kind: 'undoing' };
		try {
			const res = await fetch('/api/audio/bulk/undo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					entries: savedRows.map((r) => ({ wordId: r.wordId, audioUrl: r.audioUrl }))
				})
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `Undo failed: ${res.status}`);
			}
			const count = savedRows.length;
			savedRows = [];
			session = { kind: 'undone', count };
			toast.success(`Undid ${count} word${count === 1 ? '' : 's'}.`);
			await invalidateAll();
		} catch (err) {
			session = {
				kind: 'error',
				message: err instanceof Error ? err.message : 'Could not undo audio.'
			};
		}
	}

	$effect(() => {
		return () => {
			teardown();
			// If the user dismisses the recorder while reviewing, the processed clips
			// are orphan files on disk. Fire-and-forget a discard so they're cleaned up.
			if (resultRows.length > 0 && session.kind === 'reviewing') {
				const body = new Blob(
					[JSON.stringify({ keep: [], discard: resultRows.map((r) => r.audioUrl) })],
					{ type: 'application/json' }
				);
				try {
					navigator.sendBeacon('/api/audio/bulk/commit', body);
				} catch {
					// best effort
				}
			}
		};
	});

	$effect(() => {
		const id = targetWordId;
		const container = listEl;
		if (!id || !container) return;
		const row = container.querySelector<HTMLElement>(`[data-word-id="${CSS.escape(id)}"]`);
		if (!row) return;
		const target = row.offsetTop - (container.clientHeight - row.offsetHeight) / 2;
		const max = container.scrollHeight - container.clientHeight;
		container.scrollTo({
			top: Math.max(0, Math.min(max, target)),
			behavior: 'smooth'
		});
	});

	$effect(() => {
		const id = playingWordId;
		if (!id) return;
		const row = document.querySelector<HTMLElement>(`tr[data-row-word-id="${CSS.escape(id)}"]`);
		if (!row) return;
		row.scrollIntoView({ block: 'center', behavior: 'smooth' });
	});
</script>

<section class="bulk-recorder" aria-live="polite">
	{#if session.kind === 'idle'}
		<div class="bulk-intro">
			<div class="bulk-actions bulk-actions-top">
				<button type="button" class="btn primary" onclick={startSession}>
					Start recording
				</button>
			</div>
			<p>
				You'll record <strong>{totalWords}</strong> word{totalWords === 1 ? '' : 's'} in one
				continuous take. Pause for about a second between words; the recorder will advance
				automatically.
			</p>
			<ul class="bulk-tips">
				<li>Speak at a steady volume.</li>
				<li>The list shows every word's status as you go — click <em>Redo</em> on any captured word to re-record it.</li>
				<li>Use <em>Skip</em> on a word you don't want to record this session.</li>
			</ul>

			<div class="bulk-preview-head">
				<span class="bulk-preview-label">Words in this session</span>
				<span class="muted">{totalWords}</span>
			</div>
			<ol class="bulk-list bulk-preview-list">
				{#each words as word, i (word.id)}
					<li class="bulk-list-row bulk-preview-row">
						<span class="bulk-preview-index">{i + 1}.</span>
						<span class="bulk-list-word">{word.kalenjin}</span>
						<span class="bulk-list-trans muted">{word.translations}</span>
					</li>
				{/each}
			</ol>
		</div>
	{:else if session.kind === 'priming' || session.kind === 'speaking' || session.kind === 'waiting' || session.kind === 'finishing'}
		<div class="bulk-active">
			<div class="bulk-progress">
				<div class="bulk-progress-bar">
					<div class="bulk-progress-fill" style:width="{progressPct}%"></div>
				</div>
				<div class="bulk-progress-label">
					{capturedCount} captured · {skippedCount} skipped · {totalWords - completedCount} pending
				</div>
			</div>

			<div
				class="bulk-status"
				class:bulk-status-speak={session.kind === 'speaking' ||
					(session.kind === 'priming' && aboveSpeaking)}
				class:bulk-status-wait={session.kind === 'waiting' || session.kind === 'priming'}
			>
				{#if session.kind === 'priming'}
					<span class="bulk-dot" aria-hidden="true"></span>
					Speak the first word when you're ready…
				{:else if session.kind === 'speaking'}
					<span class="bulk-dot" aria-hidden="true"></span>
					Recording — pause briefly when done.
				{:else if session.kind === 'waiting'}
					<span class="bulk-dot bulk-dot-wait" aria-hidden="true"></span>
					Speak now: next word.
				{:else if session.kind === 'finishing'}
					Finalising recording…
				{/if}
			</div>

			{#if currentWord}
				<div class="bulk-word">
					<div class="bulk-word-current">{currentWord.kalenjin}</div>
					<div class="bulk-word-translation">{currentWord.translations}</div>
				</div>
				{#if nextWord}
					<div class="bulk-word-next">
						<span class="muted">Next:</span> {nextWord.kalenjin}
					</div>
				{/if}
			{/if}

			<div class="bulk-meter" aria-hidden="true">
				<div class="bulk-meter-fill" style:width="{meterPct}%"></div>
			</div>

			<div
				class="bulk-list"
				role="list"
				aria-label="Words in this session"
				bind:this={listEl}
			>
				{#each words as word (word.id)}
					{@const status = statusOf(word.id)}
					<div
						class="bulk-list-row"
						class:current={status === 'current'}
						role="listitem"
						data-word-id={word.id}
					>
						<span class="bulk-list-status status-{status}" aria-label={status}>
							{#if status === 'captured'}✓{:else if status === 'skipped'}✕{:else if status === 'current'}●{:else}·{/if}
						</span>
						<span class="bulk-list-word">{word.kalenjin}</span>
						<span class="bulk-list-trans muted">{word.translations}</span>
						<span class="bulk-list-actions">
							{#if status === 'captured'}
								<button
									type="button"
									class="btn-mini"
									onclick={() => redoWord(word.id)}
									disabled={session.kind === 'finishing'}
								>
									Redo
								</button>
								<button
									type="button"
									class="btn-mini ghost"
									onclick={() => requestSkip(word.id)}
									disabled={session.kind === 'finishing'}
								>
									Skip
								</button>
							{:else if status === 'skipped'}
								<button
									type="button"
									class="btn-mini"
									onclick={() => restoreWord(word.id)}
									disabled={session.kind === 'finishing'}
								>
									Restore
								</button>
							{:else if status === 'pending' || status === 'current'}
								<button
									type="button"
									class="btn-mini ghost"
									onclick={() => requestSkip(word.id)}
									disabled={session.kind === 'finishing'}
								>
									Skip
								</button>
							{/if}
						</span>
					</div>
				{/each}
			</div>

			<div class="bulk-actions">
				<button
					type="button"
					class="btn-sm primary"
					onclick={stopEarly}
					disabled={session.kind === 'finishing'}
				>
					Finish
				</button>
			</div>
		</div>
	{:else if session.kind === 'processing'}
		<div class="bulk-uploading">
			<p>Splitting and processing {segments.length} clip{segments.length === 1 ? '' : 's'}…</p>
			<p class="muted">This may take a few seconds.</p>
		</div>
	{:else if session.kind === 'reviewing'}
		<div class="bulk-review">
			<h3>Review {resultRows.length} clip{resultRows.length === 1 ? '' : 's'}</h3>
			<p class="muted">
				Listen to each clip and uncheck any you don't want to save. Nothing is saved to the
				dictionary until you click <strong>Save selected</strong>.
			</p>

			<div class="bulk-actions">
				<button
					type="button"
					class="btn primary"
					onclick={saveSelected}
					disabled={reviewSelected.size === 0}
				>
					Save selected ({reviewSelected.size})
				</button>
				{#if playingWordId}
					<button type="button" class="btn" onclick={stopPlayback}>Stop playback</button>
				{:else}
					<button
						type="button"
						class="btn"
						onclick={playAll}
						disabled={reviewSelected.size === 0}
					>
						Play all
					</button>
				{/if}
				<button type="button" class="btn-sm ghost" onclick={selectAllReview}>Select all</button>
				<button type="button" class="btn-sm ghost" onclick={selectNoneReview}>Select none</button>
				<button type="button" class="btn-sm ghost danger" onclick={discardAll}>
					Discard all
				</button>
			</div>

			<table class="bulk-results">
				<thead>
					<tr>
						<th class="col-check">
							<input
								type="checkbox"
								aria-label="Select all"
								checked={reviewSelected.size === resultRows.length && resultRows.length > 0}
								onchange={() =>
									reviewSelected.size === resultRows.length
										? selectNoneReview()
										: selectAllReview()}
							/>
						</th>
						<th>Word</th>
						<th>Translation</th>
						<th>Audio</th>
						<th class="num">Length</th>
					</tr>
				</thead>
				<tbody>
					{#each resultRows as row (row.wordId)}
						{@const w = wordById.get(row.wordId)}
						<tr
							data-row-word-id={row.wordId}
							class:row-playing={playingWordId === row.wordId}
							class:row-deselected={!reviewSelected.has(row.wordId)}
						>
							<td class="col-check">
								<input
									type="checkbox"
									aria-label={`Save ${w?.kalenjin ?? row.wordId}`}
									checked={reviewSelected.has(row.wordId)}
									onchange={() => toggleReviewSelected(row.wordId)}
								/>
							</td>
							<td>{w?.kalenjin ?? row.wordId}</td>
							<td class="muted">{w?.translations ?? ''}</td>
							<td>
								<audio
									controls
									src={row.audioUrl}
									preload="none"
									{@attach (el) => {
										audioEls.set(row.wordId, el as HTMLAudioElement);
										return () => audioEls.delete(row.wordId);
									}}
								></audio>
							</td>
							<td class="num">{row.durationSec ? row.durationSec.toFixed(2) + 's' : '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>

			{#if processingSkipped.length > 0}
				<h4>Skipped during processing</h4>
				<ul class="bulk-skipped">
					{#each processingSkipped as row (row.wordId)}
						{@const w = wordById.get(row.wordId)}
						<li><strong>{w?.kalenjin ?? row.wordId}</strong> — {row.reason}</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else if session.kind === 'saving'}
		<div class="bulk-uploading">
			<p>Saving…</p>
		</div>
	{:else if session.kind === 'discarding'}
		<div class="bulk-uploading">
			<p>Discarding…</p>
		</div>
	{:else if session.kind === 'undoing'}
		<div class="bulk-uploading">
			<p>Undoing session…</p>
		</div>
	{:else if session.kind === 'undone'}
		<div class="bulk-done">
			<h3>Undid {session.count} word{session.count === 1 ? '' : 's'}</h3>
			<p class="muted">The audio has been removed and the words are back on the missing-audio list.</p>
		</div>
	{:else if session.kind === 'done'}
		<div class="bulk-done">
			<h3>Saved {session.saved} word{session.saved === 1 ? '' : 's'}</h3>
			{#if savedRows.length > 0}
				<table class="bulk-results">
					<thead>
						<tr>
							<th>Word</th>
							<th>Translation</th>
							<th>Audio</th>
							<th class="num">Length</th>
						</tr>
					</thead>
					<tbody>
						{#each savedRows as row (row.wordId)}
							{@const w = wordById.get(row.wordId)}
							<tr>
								<td>{w?.kalenjin ?? row.wordId}</td>
								<td class="muted">{w?.translations ?? ''}</td>
								<td><audio controls src={row.audioUrl} preload="none"></audio></td>
								<td class="num">{row.durationSec ? row.durationSec.toFixed(2) + 's' : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<div class="bulk-actions">
					<button type="button" class="btn danger" onclick={() => (confirmUndo = true)}>
						Undo this session
					</button>
				</div>
			{/if}
		</div>
	{:else if session.kind === 'error'}
		<div class="bulk-error">
			<p class="bulk-error-msg">{session.message}</p>
			<div class="bulk-actions">
				<button type="button" class="btn" onclick={() => (session = { kind: 'idle' })}>
					Try again
				</button>
			</div>
		</div>
	{/if}
</section>

{#if confirmUndo}
	<div
		class="confirm-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) confirmUndo = false;
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') confirmUndo = false;
		}}
	>
		<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="undo-title">
			<h3 id="undo-title">Undo this session?</h3>
			<p>
				All {resultRows.length} audio clip{resultRows.length === 1 ? '' : 's'} saved in this session
				will be deleted. This cannot be undone.
			</p>
			<div class="bulk-actions">
				<button type="button" class="btn danger" onclick={undoSession}>Undo session</button>
				<button type="button" class="btn ghost" onclick={() => (confirmUndo = false)}>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

{#if skipPromptId}
	{@const skipWord = wordById.get(skipPromptId)}
	<div
		class="confirm-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) skipPromptId = null;
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') skipPromptId = null;
		}}
	>
		<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="skip-title">
			<h3 id="skip-title">Double-check this entry</h3>
			{#if skipWord}
				<div class="skip-preview">
					<div class="skip-preview-word">{skipWord.kalenjin}</div>
					<div class="skip-preview-trans">{skipWord.translations}</div>
				</div>
			{/if}
			<p>
				Make sure the Kalenjin spelling and translation are correct before skipping. If something
				looks off, open the dictionary entry to fix it; if it's right but you can't record it now,
				you can skip.
			</p>
			<div class="bulk-actions">
				<button type="button" class="btn" onclick={confirmSkip}>Skip this word</button>
				{#if skipWord}
					<a
						class="btn ghost"
						href={`/dictionary/${skipWord.id}`}
						target="_blank"
						rel="noopener"
					>
						Open in dictionary →
					</a>
				{/if}
				<button type="button" class="btn ghost" onclick={() => (skipPromptId = null)}>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.bulk-recorder {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.bulk-intro p {
		margin: 0 0 8px 0;
	}
	.bulk-tips {
		margin: 0 0 16px 18px;
		padding: 0;
		color: var(--ink-soft);
		font-size: 14px;
	}
	.bulk-tips li {
		margin-bottom: 4px;
	}
	.bulk-preview-head {
		align-items: baseline;
		display: flex;
		gap: 8px;
		justify-content: space-between;
		margin: 8px 0 6px;
	}
	.bulk-preview-label {
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.bulk-preview-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.bulk-preview-row {
		grid-template-columns: 32px minmax(0, 1.2fr) minmax(0, 2fr);
	}
	.bulk-preview-index {
		color: var(--ink-mute);
		font-size: 13px;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.bulk-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 12px;
	}
	.bulk-actions-top {
		margin-top: 0;
		margin-bottom: 16px;
	}
	.bulk-progress {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.bulk-progress-bar {
		background: var(--surface-mute, #e5e7eb);
		border-radius: 999px;
		height: 6px;
		overflow: hidden;
	}
	.bulk-progress-fill {
		background: var(--accent, #2563eb);
		height: 100%;
		transition: width 120ms ease-out;
	}
	.bulk-progress-label {
		color: var(--ink-mute);
		font-size: 13px;
	}
	.bulk-status {
		align-items: center;
		display: flex;
		font-size: 14px;
		gap: 8px;
		font-weight: 500;
	}
	.bulk-status-speak {
		color: #b91c1c;
	}
	.bulk-status-wait {
		color: var(--ink-soft);
	}
	.bulk-dot {
		background: #e11d48;
		border-radius: 50%;
		display: inline-block;
		height: 10px;
		width: 10px;
		animation: bulk-pulse 1s ease-in-out infinite;
	}
	.bulk-dot-wait {
		background: #9ca3af;
		animation: none;
	}
	@keyframes bulk-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bulk-dot {
			animation: none;
		}
	}
	.bulk-word {
		background: var(--bg-raised);
		border: 1px solid var(--line-soft);
		border-radius: 12px;
		color: var(--ink);
		padding: 24px 16px;
		text-align: center;
	}
	.bulk-word-current {
		color: var(--ink);
		font-size: 32px;
		font-weight: 600;
		line-height: 1.2;
	}
	.bulk-word-translation {
		color: var(--ink-soft);
		font-size: 16px;
		margin-top: 4px;
	}
	.bulk-word-next {
		text-align: center;
		font-size: 14px;
		color: var(--ink-mute);
	}
	.bulk-meter {
		background: var(--surface-mute, #e5e7eb);
		border-radius: 4px;
		height: 8px;
		overflow: hidden;
	}
	.bulk-meter-fill {
		background: linear-gradient(90deg, #16a34a 0%, #facc15 70%, #ef4444 100%);
		height: 100%;
		transition: width 60ms linear;
	}

	.bulk-list {
		border: 1px solid var(--line-soft);
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		max-height: 320px;
		overflow-y: auto;
		position: relative;
	}
	.bulk-list-row {
		align-items: center;
		border-bottom: 1px solid var(--line-soft);
		display: grid;
		gap: 10px;
		grid-template-columns: 24px minmax(0, 1.2fr) minmax(0, 2fr) auto;
		padding: 8px 12px;
	}
	.bulk-list-row:last-child {
		border-bottom: 0;
	}
	.bulk-list-row.current {
		background: color-mix(in oklch, var(--brand) 8%, transparent);
	}
	.bulk-list-status {
		align-items: center;
		display: inline-flex;
		font-weight: 600;
		justify-content: center;
		width: 24px;
	}
	.status-pending {
		color: var(--ink-mute);
	}
	.status-current {
		color: #b91c1c;
	}
	.status-captured {
		color: #16a34a;
	}
	.status-skipped {
		color: var(--ink-mute);
		text-decoration: line-through;
	}
	.bulk-list-word {
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bulk-list-trans {
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bulk-list-actions {
		display: flex;
		gap: 4px;
	}

	.btn-mini {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 6px;
		color: var(--ink);
		cursor: pointer;
		font: inherit;
		font-size: 12px;
		padding: 3px 8px;
	}
	.btn-mini:hover:not(:disabled) {
		border-color: color-mix(in oklch, var(--brand) 32%, var(--line));
	}
	.btn-mini:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.btn-mini.ghost {
		background: transparent;
		color: var(--ink-soft);
	}
	.btn-mini.danger {
		border-color: color-mix(in oklch, #b91c1c 40%, var(--line));
		color: #b91c1c;
	}

	.bulk-uploading p {
		margin: 4px 0;
	}
	.bulk-uploading .muted,
	.muted {
		color: var(--ink-mute);
	}
	.bulk-done h3 {
		margin: 0 0 12px 0;
	}
	.bulk-review h4 {
		margin: 16px 0 8px 0;
	}
	.bulk-review h3 {
		margin: 0 0 6px 0;
	}
	.bulk-review p {
		margin: 0 0 12px 0;
	}
	.bulk-review .col-check {
		width: 36px;
	}
	.bulk-results tr.row-playing {
		background: color-mix(in oklch, var(--brand) 12%, transparent);
	}
	.bulk-results tr.row-deselected td {
		opacity: 0.45;
	}
	.btn-sm.danger {
		color: #b91c1c;
	}
	.btn-sm.danger:hover:not(:disabled) {
		border-color: color-mix(in oklch, #b91c1c 40%, var(--line));
	}
	.bulk-results {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	.bulk-results th,
	.bulk-results td {
		text-align: left;
		padding: 6px 8px;
		border-bottom: 1px solid var(--line-soft);
		vertical-align: middle;
	}
	.bulk-results .num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.bulk-results audio {
		max-width: 220px;
		height: 32px;
	}
	.bulk-skipped {
		margin: 0;
		padding-left: 18px;
	}
	.bulk-error-msg {
		color: #b91c1c;
		margin: 0 0 8px 0;
	}

	.confirm-backdrop {
		align-items: center;
		background: rgba(15, 23, 42, 0.5);
		display: flex;
		inset: 0;
		justify-content: center;
		padding: 1rem;
		position: fixed;
		z-index: 80;
	}
	.confirm-dialog {
		background: var(--bg-raised, var(--paper));
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: 0 20px 45px rgba(15, 23, 42, 0.25);
		max-width: 420px;
		padding: 1.25rem 1.5rem 1.5rem;
		width: 100%;
	}
	.confirm-dialog h3 {
		margin: 0 0 8px 0;
	}
	.confirm-dialog p {
		margin: 0 0 4px 0;
		color: var(--ink-soft);
	}
	.skip-preview {
		background: var(--bg-raised);
		border: 1px solid var(--line-soft);
		border-radius: 10px;
		color: var(--ink);
		margin: 8px 0 12px;
		padding: 16px;
		text-align: center;
	}
	.skip-preview-word {
		color: var(--ink);
		font-size: 24px;
		font-weight: 600;
	}
	.skip-preview-trans {
		color: var(--ink-soft);
		font-size: 14px;
		margin-top: 2px;
	}

	.btn.danger {
		background: #b91c1c;
		border-color: #b91c1c;
		color: white;
	}
	.btn.danger:hover {
		background: #991b1b;
	}
</style>
