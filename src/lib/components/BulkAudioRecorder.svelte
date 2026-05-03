<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/stores/toast.svelte';

	type WordItem = {
		id: string;
		kalenjin: string;
		translations: string;
	};

	type Props = {
		words: WordItem[];
		onclose?: () => void;
	};

	let { words, onclose }: Props = $props();
	let currentWords = $state<WordItem[]>(untrack(() => [...words]));

	type SessionState =
		| { kind: 'idle' }
		| { kind: 'priming'; targetWordId: string }
		| { kind: 'speaking'; targetWordId: string; startedAt: number }
		| { kind: 'waiting'; targetWordId: string }
		| {
				kind: 'paused';
				resumeTo:
					| { kind: 'priming'; targetWordId: string }
					| { kind: 'speaking'; targetWordId: string; startedAt: number }
					| { kind: 'waiting'; targetWordId: string };
				pausedAt: number;
		  }
		| { kind: 'finishing' }
		| { kind: 'processing' }
		| { kind: 'reviewing' }
		| { kind: 'saving' }
		| { kind: 'discarding' }
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
	type ReviewState = 'keep' | 'skip' | 'redo';
	let reviewStates = $state<Map<string, ReviewState>>(new Map());
	let playingWordId = $state<string | null>(null);
	let playProgress = $state(0);
	let playSequence: string[] = [];
	let playSequenceIndex = 0;
	let confirmRerecord = $state(false);
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
	const totalWords = $derived(currentWords.length);
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
		if (session.kind === 'paused') {
			return session.resumeTo.targetWordId;
		}
		return null;
	});
	const currentWord = $derived(targetWordId ? (wordById.get(targetWordId) ?? null) : null);
	const nextWord = $derived.by(() => {
		if (!targetWordId) return null;
		const idx = currentWords.findIndex((w) => w.id === targetWordId);
		for (let i = idx + 1; i < currentWords.length; i += 1) {
			const w = currentWords[i];
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
		for (const w of currentWords) {
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
		const firstId = currentWords[0]?.id;
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

	function pauseSession() {
		if (
			session.kind !== 'priming' &&
			session.kind !== 'speaking' &&
			session.kind !== 'waiting'
		)
			return;
		if (mediaRecorder && mediaRecorder.state === 'recording') {
			try {
				mediaRecorder.pause();
			} catch {
				// ignore
			}
		}
		if (rafHandle !== null) {
			cancelAnimationFrame(rafHandle);
			rafHandle = null;
		}
		const pausedAt = performance.now();
		const resumeTo =
			session.kind === 'speaking'
				? {
						kind: 'speaking' as const,
						targetWordId: session.targetWordId,
						startedAt: session.startedAt
					}
				: session.kind === 'waiting'
					? { kind: 'waiting' as const, targetWordId: session.targetWordId }
					: { kind: 'priming' as const, targetWordId: session.targetWordId };
		session = { kind: 'paused', resumeTo, pausedAt };
	}

	function resumeSession() {
		if (session.kind !== 'paused') return;
		const now = performance.now();
		const pauseDur = now - session.pausedAt;
		// Shift the recording-time origin forward so elapsedMs continues from where we left off,
		// keeping segment timestamps aligned with the (paused) MediaRecorder timeline.
		recordingStartTs += pauseDur;
		lastVoicedTs += pauseDur;
		if (mediaRecorder && mediaRecorder.state === 'paused') {
			try {
				mediaRecorder.resume();
			} catch {
				// ignore
			}
		}
		session = session.resumeTo;
		if (rafHandle === null) {
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
			const initialStates = new Map<string, ReviewState>();
			for (const r of payload.results) initialStates.set(r.wordId, 'keep');
			reviewStates = initialStates;
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

	function stateOf(wordId: string): ReviewState {
		return reviewStates.get(wordId) ?? 'keep';
	}

	function setReviewState(wordId: string, next: ReviewState) {
		const m = new Map(reviewStates);
		m.set(wordId, next);
		reviewStates = m;
	}

	function toggleKeepSkip(wordId: string) {
		const cur = stateOf(wordId);
		setReviewState(wordId, cur === 'keep' ? 'skip' : 'keep');
	}

	function toggleRedo(wordId: string) {
		const cur = stateOf(wordId);
		setReviewState(wordId, cur === 'redo' ? 'keep' : 'redo');
	}

	const keepRows = $derived(resultRows.filter((r) => stateOf(r.wordId) === 'keep'));
	const skipRows = $derived(resultRows.filter((r) => stateOf(r.wordId) === 'skip'));
	const redoRows = $derived(resultRows.filter((r) => stateOf(r.wordId) === 'redo'));
	const keepCount = $derived(keepRows.length);
	const redoCount = $derived(redoRows.length);
	const totalAudioSec = $derived(keepRows.reduce((sum, r) => sum + (r.durationSec ?? 0), 0));

	async function postCommit(
		keep: { wordId: string; audioUrl: string }[],
		discard: string[]
	): Promise<Set<string>> {
		const res = await fetch('/api/audio/bulk/commit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ keep, discard })
		});
		if (!res.ok) {
			const text = await res.text().catch(() => '');
			throw new Error(text || `Save failed: ${res.status}`);
		}
		const payload = (await res.json()) as {
			committed: { wordId: string; audioUrl: string }[];
		};
		return new Set(payload.committed.map((c) => c.wordId));
	}

	async function saveSelected() {
		stopPlayback();
		if (resultRows.length === 0) {
			session = { kind: 'idle' };
			return;
		}
		const keep = keepRows.slice();
		const skip = skipRows.slice();
		const redo = redoRows.slice();

		if (keep.length === 0 && redo.length === 0) {
			void discardAll();
			return;
		}

		// If there are redos, we save keeps + discard skips and leave the redos in the review.
		// If no redos, we save keeps + discard skips and dismiss back to the missing-audio list.
		session = { kind: 'saving' };
		try {
			const committedIds = await postCommit(
				keep.map((r) => ({ wordId: r.wordId, audioUrl: r.audioUrl })),
				skip.map((r) => r.audioUrl)
			);
			const newlySaved = keep.filter((r) => committedIds.has(r.wordId));
			await invalidateAll();
			if (newlySaved.length > 0) {
				toast.success(
					`Saved ${newlySaved.length} word${newlySaved.length === 1 ? '' : 's'}.`
				);
			}

			if (redo.length === 0) {
				resultRows = [];
				reviewStates = new Map();
				session = { kind: 'idle' };
				onclose?.();
				return;
			}

			// Drop kept and skipped rows from the review; only redos remain.
			resultRows = redo;
			const remainingStates = new Map<string, ReviewState>();
			for (const r of redo) remainingStates.set(r.wordId, 'redo');
			reviewStates = remainingStates;
			session = { kind: 'reviewing' };
		} catch (err) {
			session = {
				kind: 'error',
				message: err instanceof Error ? err.message : 'Could not save audio.'
			};
		}
	}

	function requestRerecord() {
		if (redoCount === 0) return;
		if (keepCount > 0) {
			confirmRerecord = true;
			return;
		}
		void executeRerecord();
	}

	async function executeRerecord() {
		confirmRerecord = false;
		stopPlayback();
		const keep = keepRows.slice();
		const skip = skipRows.slice();
		const redo = redoRows.slice();
		if (redo.length === 0) return;

		session = { kind: 'saving' };
		try {
			// Save keeps; discard skips + the existing redo files (about to be re-recorded).
			const committedIds = await postCommit(
				keep.map((r) => ({ wordId: r.wordId, audioUrl: r.audioUrl })),
				[...skip.map((r) => r.audioUrl), ...redo.map((r) => r.audioUrl)]
			);
			const newlySaved = keep.filter((r) => committedIds.has(r.wordId));
			await invalidateAll();
			if (newlySaved.length > 0) {
				toast.success(`Saved ${newlySaved.length} word${newlySaved.length === 1 ? '' : 's'}.`);
			}

			// Restart the bulk session with only the redo'd words.
			const redoWordIds = new Set(redo.map((r) => r.wordId));
			const redoWords = currentWords.filter((w) => redoWordIds.has(w.id));
			currentWords = redoWords;
			resultRows = [];
			reviewStates = new Map();
			processingSkipped = [];
			segments = [];
			skippedSet = new Set();
			await startSession();
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
			onclose?.();
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
			reviewStates = new Map();
			session = { kind: 'idle' };
			toast.success('Recording discarded.');
			onclose?.();
		} catch (err) {
			session = {
				kind: 'error',
				message: err instanceof Error ? err.message : 'Could not discard audio.'
			};
		}
	}

	function playRow(wordId: string) {
		if (playingWordId === wordId) {
			stopPlayback();
			return;
		}
		const el = audioEls.get(wordId);
		if (!el) return;
		stopPlayback();
		playingWordId = wordId;
		playProgress = 0;
		el.currentTime = 0;
		el.ontimeupdate = () => {
			if (!el.duration || !Number.isFinite(el.duration)) return;
			playProgress = el.currentTime / el.duration;
		};
		el.onended = () => {
			if (playingWordId === wordId) {
				playingWordId = null;
				playProgress = 0;
			}
		};
		el.play().catch(() => {
			playingWordId = null;
			playProgress = 0;
		});
	}

	function playAll() {
		stopPlayback();
		const ids = resultRows
			.filter((r) => stateOf(r.wordId) === 'keep')
			.map((r) => r.wordId);
		if (ids.length === 0) return;
		playSequence = ids;
		playSequenceIndex = 0;
		playNextInSequence();
	}

	function playNextInSequence() {
		if (playSequenceIndex >= playSequence.length) {
			playingWordId = null;
			playProgress = 0;
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
		playProgress = 0;
		el.currentTime = 0;
		el.ontimeupdate = () => {
			if (!el.duration || !Number.isFinite(el.duration)) return;
			playProgress = el.currentTime / el.duration;
		};
		el.onended = () => {
			playSequenceIndex += 1;
			playNextInSequence();
		};
		el.play().catch(() => {
			playSequenceIndex += 1;
			playNextInSequence();
		});
	}

	function seekTo(wordId: string, fraction: number) {
		const el = audioEls.get(wordId);
		if (!el || !el.duration || !Number.isFinite(el.duration)) return;
		el.currentTime = Math.max(0, Math.min(el.duration, el.duration * fraction));
		playProgress = fraction;
		if (playingWordId !== wordId) {
			playRow(wordId);
		}
	}

	function stopPlayback() {
		if (playingWordId) {
			const el = audioEls.get(playingWordId);
			if (el) {
				try {
					el.pause();
					el.ontimeupdate = null;
					el.onended = null;
				} catch {
					// ignore
				}
			}
		}
		playingWordId = null;
		playProgress = 0;
		playSequence = [];
		playSequenceIndex = 0;
	}

	function seededWaveform(seed: number, len: number, lengthSec: number): number[] {
		const bars: number[] = [];
		let s = seed * 9301 + 49297;
		for (let i = 0; i < len; i += 1) {
			s = (s * 9301 + 49297) % 233280;
			const r = s / 233280;
			const t = i / Math.max(1, len - 1);
			const env = Math.pow(Math.sin(t * Math.PI), 0.5);
			const noise = 0.35 + r * 0.65;
			bars.push(Math.max(0.18, env * noise));
		}
		const lenScale = Math.min(1, 0.55 + lengthSec * 0.4);
		return bars.map((b) => b * lenScale);
	}

	function hashId(id: string): number {
		let h = 0;
		for (let i = 0; i < id.length; i += 1) {
			h = (h * 31 + id.charCodeAt(i)) | 0;
		}
		return Math.abs(h) || 1;
	}

	function fmtSecMs(s: number): string {
		const sec = Math.floor(s);
		const cs = Math.round((s - sec) * 100);
		return `0:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
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
				{#each currentWords as word, i (word.id)}
					<li class="bulk-list-row bulk-preview-row">
						<span class="bulk-preview-index">{i + 1}.</span>
						<span class="bulk-list-word">{word.kalenjin}</span>
						<span class="bulk-list-trans muted">{word.translations}</span>
					</li>
				{/each}
			</ol>
		</div>
	{:else if session.kind === 'priming' || session.kind === 'speaking' || session.kind === 'waiting' || session.kind === 'finishing' || session.kind === 'paused'}
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
				class:bulk-status-paused={session.kind === 'paused'}
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
				{:else if session.kind === 'paused'}
					<span class="bulk-dot bulk-dot-wait" aria-hidden="true"></span>
					Recording paused.
				{:else if session.kind === 'finishing'}
					Finalising recording…
				{/if}
			</div>

			{#if currentWord}
				<div class="bulk-word-row">
					<button
						type="button"
						class="bulk-pause-btn"
						class:is-paused={session.kind === 'paused'}
						onclick={() => (session.kind === 'paused' ? resumeSession() : pauseSession())}
						disabled={session.kind === 'finishing'}
						aria-label={session.kind === 'paused' ? 'Resume recording' : 'Pause recording'}
					>
						{#if session.kind === 'paused'}
							<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M7 5v14a1 1 0 0 0 1.55.83l11-7a1 1 0 0 0 0-1.66l-11-7A1 1 0 0 0 7 5z" />
							</svg>
						{:else}
							<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<rect x="6" y="5" width="4" height="14" rx="1" />
								<rect x="14" y="5" width="4" height="14" rx="1" />
							</svg>
						{/if}
					</button>
					<div class="bulk-word">
						<div class="bulk-word-current">{currentWord.kalenjin}</div>
						<div class="bulk-word-translation">{currentWord.translations}</div>
					</div>
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
				{#each currentWords as word (word.id)}
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
			<header class="review-head">
				<div class="review-head-text">
					<h3>Review your clips</h3>
					<p>
						Listen back to each recording and untick any you don't want to keep. Nothing is
						saved until you press <b>Save selected</b>.
					</p>
				</div>
				<div class="session-stats">
					<div class="session-stat brand">
						<b>{keepCount}<span class="muted-frac">/{resultRows.length}</span></b>
						selected
					</div>
					<div class="session-stat">
						<b>{totalAudioSec.toFixed(1)}s</b>
						audio
					</div>
				</div>
			</header>

			<div class="session-actions">
				{#if playingWordId}
					<button type="button" class="btn ghost with-icon" onclick={stopPlayback}>
						<svg class="icn" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
							<rect x="4" y="3" width="3" height="10" rx="1" />
							<rect x="9" y="3" width="3" height="10" rx="1" />
						</svg>
						Stop
					</button>
				{:else}
					<button
						type="button"
						class="btn ghost with-icon"
						onclick={playAll}
						disabled={keepCount === 0}
					>
						<svg class="icn" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
							<path d="M3 4v8l6-4z" />
							<path d="M9 4v8l6-4z" opacity="0.55" />
						</svg>
						Play all
					</button>
				{/if}
				<button type="button" class="btn danger with-icon" onclick={discardAll}>
					<svg
						class="icn"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path
							d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 4.5l.7 9a1 1 0 0 0 1 .9h2.6a1 1 0 0 0 1-.9l.7-9"
						/>
					</svg>
					Discard
				</button>
				<div class="actions-spacer"></div>
				<button
					type="button"
					class="btn primary with-icon"
					onclick={saveSelected}
					disabled={keepCount === 0 && redoCount === 0}
				>
					<svg
						class="icn"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M3 8.5l3.5 3.5L13 5" />
					</svg>
					Save selected
					<span class="badge">{keepCount}</span>
				</button>
				{#if redoCount > 0}
					<button type="button" class="btn accent with-icon" onclick={requestRerecord}>
						<svg
							width="14"
							height="14"
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M13 4v3.5h-3.5" />
							<path d="M13 7.5A5 5 0 1 0 11.5 12" />
						</svg>
						Re-record {redoCount} {redoCount === 1 ? 'word' : 'words'}
					</button>
				{/if}
			</div>

			<table class="session-table">
				<thead>
					<tr>
						<th class="col-idx num">#</th>
						<th>Word</th>
						<th>Translation</th>
						<th>Audio</th>
						<th class="col-action">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each resultRows as row, i (row.wordId)}
						{@const w = wordById.get(row.wordId)}
						{@const state = stateOf(row.wordId)}
						{@const seed = hashId(row.wordId)}
						{@const dur = row.durationSec ?? 0}
						{@const bars = seededWaveform(seed, 64, dur)}
						<tr
							data-row-word-id={row.wordId}
							class:playing={playingWordId === row.wordId}
							class:skip-row={state === 'skip'}
							class:redo-row={state === 'redo'}
						>
							<td class="col-idx">{String(i + 1).padStart(2, '0')}</td>
							<td class="col-word">
								<span class="word">{w?.kalenjin ?? row.wordId}</span>
							</td>
							<td class="col-trans">
								<span class="gloss">{w?.translations ?? ''}</span>
							</td>
							<td class="col-audio">
								<div class="player">
									<button
										type="button"
										class="play-btn"
										class:is-playing={playingWordId === row.wordId}
										onclick={() => playRow(row.wordId)}
										aria-label={playingWordId === row.wordId ? 'Pause' : 'Play'}
									>
										{#if playingWordId === row.wordId}
											<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
												<rect x="4" y="3" width="3" height="10" rx="1" />
												<rect x="9" y="3" width="3" height="10" rx="1" />
											</svg>
										{:else}
											<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
												<path
													d="M5 3.5v9a.5.5 0 0 0 .76.43l7-4.5a.5.5 0 0 0 0-.86l-7-4.5A.5.5 0 0 0 5 3.5z"
												/>
											</svg>
										{/if}
									</button>
									<div
										class="waveform"
										role="slider"
										tabindex="0"
										aria-label="Seek"
										aria-valuemin="0"
										aria-valuemax="100"
										aria-valuenow={Math.round((playingWordId === row.wordId ? playProgress : 0) * 100)}
										onclick={(e) => {
											const target = e.currentTarget as HTMLElement;
											const r = target.getBoundingClientRect();
											const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
											seekTo(row.wordId, p);
										}}
										onkeydown={(e) => {
											if (e.key === 'ArrowLeft') seekTo(row.wordId, Math.max(0, playProgress - 0.05));
											else if (e.key === 'ArrowRight') seekTo(row.wordId, Math.min(1, playProgress + 0.05));
										}}
									>
										{#each bars as h, bi (bi)}
											{@const played =
												playingWordId === row.wordId && bi / bars.length <= playProgress}
											<div
												class="bar"
												class:played
												style:height="{Math.round(h * 100)}%"
											></div>
										{/each}
									</div>
									<span class="timestamp">{fmtSecMs(dur)}</span>
								</div>
								<audio
									src={row.audioUrl}
									preload="metadata"
									{@attach (el) => {
										audioEls.set(row.wordId, el as HTMLAudioElement);
										return () => audioEls.delete(row.wordId);
									}}
								></audio>
							</td>
							<td class="col-action">
								<div class="row-actions">
									<button
										type="button"
										class="keep-toggle"
										class:is-keep={state === 'keep'}
										onclick={() => toggleKeepSkip(row.wordId)}
										aria-pressed={state === 'keep'}
									>
										<span class="pip">
											<svg
												viewBox="0 0 12 12"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											>
												<path d="M2 6.5l2.5 2.5L10 3.5" />
											</svg>
										</span>
										{state === 'keep' ? 'Keep' : 'Skip'}
									</button>
									<button
										type="button"
										class="redo-btn"
										class:is-on={state === 'redo'}
										onclick={() => toggleRedo(row.wordId)}
										aria-pressed={state === 'redo'}
										title={state === 'redo' ? 'Cancel re-record' : 'Queue for re-record'}
										aria-label="Queue for re-record"
									>
										<svg
											width="14"
											height="14"
											viewBox="0 0 16 16"
											fill="none"
											stroke="currentColor"
											stroke-width="1.6"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
										>
											<path d="M13 4v3.5h-3.5" />
											<path d="M13 7.5A5 5 0 1 0 11.5 12" />
										</svg>
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>

			{#if processingSkipped.length > 0}
				<h4 class="processing-skipped-title">Skipped during processing</h4>
				<ul class="bulk-skipped">
					{#each processingSkipped as row (row.wordId)}
						{@const w = wordById.get(row.wordId)}
						<li><strong>{w?.kalenjin ?? row.wordId}</strong> — {row.reason}</li>
					{/each}
				</ul>
			{/if}

			<div class="session-foot">
				<div class="help">
					Click <kbd>play</kbd> on each clip · click the waveform to seek · toggle
					<kbd>Keep</kbd> / <kbd>Skip</kbd> per row
				</div>
			</div>
		</div>
	{:else if session.kind === 'saving'}
		<div class="bulk-uploading">
			<p>Saving…</p>
		</div>
	{:else if session.kind === 'discarding'}
		<div class="bulk-uploading">
			<p>Discarding…</p>
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

{#if confirmRerecord}
	<div
		class="confirm-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) confirmRerecord = false;
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') confirmRerecord = false;
		}}
	>
		<div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="rerec-title">
			<h3 id="rerec-title">Save and re-record?</h3>
			<p>
				{keepCount} kept word{keepCount === 1 ? '' : 's'} will be saved, then you'll start a new
				recording session for {redoCount} word{redoCount === 1 ? '' : 's'}. Skipped clips will be
				discarded.
			</p>
			<div class="bulk-actions">
				<button type="button" class="btn primary" onclick={executeRerecord}>
					Save and re-record
				</button>
				<button type="button" class="btn ghost" onclick={() => (confirmRerecord = false)}>
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
	.bulk-status-paused {
		color: var(--ink-mute);
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
	.bulk-word-row {
		align-items: stretch;
		display: flex;
		gap: 16px;
	}
	.bulk-pause-btn {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line-soft);
		border-radius: 12px;
		color: var(--brand);
		cursor: pointer;
		display: inline-flex;
		flex-shrink: 0;
		justify-content: center;
		min-height: 96px;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
		width: 96px;
	}
	.bulk-pause-btn:hover:not(:disabled) {
		background: var(--brand);
		border-color: var(--brand);
		color: oklch(0.98 0.01 85);
	}
	.bulk-pause-btn:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.bulk-pause-btn svg {
		height: 44px;
		width: 44px;
	}
	.bulk-pause-btn.is-paused {
		background: var(--accent);
		border-color: var(--accent);
		color: oklch(0.99 0.005 80);
	}
	.bulk-pause-btn.is-paused:hover:not(:disabled) {
		background: color-mix(in oklch, var(--accent) 85%, var(--ink));
		border-color: color-mix(in oklch, var(--accent) 85%, var(--ink));
	}
	.bulk-word {
		background: var(--bg-raised);
		border: 1px solid var(--line-soft);
		border-radius: 12px;
		color: var(--ink);
		flex: 1;
		min-width: 0;
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
	.bulk-review h4 {
		margin: 16px 0 8px 0;
	}
	.bulk-skipped {
		margin: 0;
		padding-left: 18px;
	}
	.bulk-error-msg {
		color: #b91c1c;
		margin: 0 0 8px 0;
	}

	/* ---------- Recording Session Review (designed per spec) ---------- */
	.bulk-review {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.review-head {
		align-items: flex-start;
		display: flex;
		flex-wrap: wrap;
		gap: 24px;
		justify-content: space-between;
	}
	.review-head-text {
		max-width: 56ch;
	}
	.review-head h3 {
		font-family: var(--font-display);
		font-size: 28px;
		font-weight: 500;
		letter-spacing: -0.015em;
		margin: 0 0 6px 0;
		color: var(--ink);
	}
	.review-head p {
		color: var(--ink-soft);
		font-size: 15px;
		margin: 0;
	}
	.review-head p b {
		color: var(--ink);
	}

	@keyframes recPulse {
		0% {
			box-shadow: 0 0 0 0 color-mix(in oklch, var(--accent) 55%, transparent);
		}
		80% {
			box-shadow: 0 0 0 7px color-mix(in oklch, var(--accent) 0%, transparent);
		}
		100% {
			box-shadow: 0 0 0 0 color-mix(in oklch, var(--accent) 0%, transparent);
		}
	}

	.session-stats {
		display: flex;
		gap: 36px;
		align-items: flex-end;
	}
	.session-stat {
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--ink-mute);
		text-align: right;
	}
	.session-stat b {
		display: block;
		font-family: var(--font-display);
		font-size: 28px;
		line-height: 1;
		color: var(--ink);
		font-weight: 500;
		letter-spacing: -0.015em;
		font-variant-numeric: tabular-nums;
		margin-bottom: 4px;
	}
	.session-stat.brand b {
		color: var(--brand);
	}
	.muted-frac {
		color: var(--ink-mute);
		font-size: 18px;
	}

	.session-actions {
		align-items: center;
		border-bottom: 1px solid var(--line-soft);
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-bottom: 6px;
		padding: 14px 0;
	}
	.actions-spacer {
		flex: 1;
	}
	.session-actions .btn.with-icon {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.session-actions .btn.primary {
		background: var(--brand);
		border: 1px solid var(--brand);
		color: oklch(0.98 0.01 85);
	}
	.session-actions .btn.primary:disabled {
		cursor: not-allowed;
		filter: none;
		opacity: 0.5;
	}
	.session-actions .btn.primary .badge {
		background: oklch(0.98 0.01 85 / 0.18);
		color: oklch(0.98 0.01 85);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 600;
		padding: 1px 7px;
		border-radius: 999px;
		letter-spacing: 0.04em;
	}
	.session-actions .btn.danger {
		background: transparent;
		border: 1px solid var(--line);
		color: oklch(0.5 0.18 28);
	}
	.session-actions .btn.danger:hover {
		background: color-mix(in oklch, oklch(0.5 0.18 28) 7%, transparent);
		border-color: color-mix(in oklch, oklch(0.5 0.18 28) 45%, var(--line));
		filter: none;
	}
	.session-actions .btn.accent {
		background: var(--accent);
		border-color: var(--accent);
		color: oklch(0.99 0.005 80);
	}
	.icn {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	.session-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 15px;
	}
	.session-table thead th {
		border-bottom: 1px solid var(--line);
		color: var(--ink-mute);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		padding: 10px 14px;
		text-align: left;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.session-table thead th.num {
		text-align: right;
	}
	.session-table tbody tr {
		border-bottom: 1px solid var(--line-soft);
		transition: background 0.12s;
	}
	.session-table tbody tr:hover {
		background: var(--surface);
	}
	.session-table tbody tr.playing {
		background: color-mix(in oklch, var(--accent-soft) 60%, transparent);
	}
	.session-table tbody tr.skip-row .col-word .word {
		color: var(--ink-mute);
		text-decoration: line-through;
		text-decoration-color: var(--ink-mute);
	}
	.session-table tbody tr.skip-row .col-trans,
	.session-table tbody tr.skip-row .player {
		opacity: 0.5;
	}
	.session-table tbody tr.redo-row {
		background: color-mix(in oklch, var(--accent-soft) 45%, transparent);
	}
	.session-table tbody td {
		padding: 14px;
		vertical-align: middle;
	}

	.col-idx {
		color: var(--ink-mute);
		font-family: var(--font-mono);
		font-size: 11px;
		text-align: right;
		width: 36px;
	}
	.col-word {
		width: 24%;
	}
	.col-word .word {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 19px;
		font-weight: 500;
		letter-spacing: -0.005em;
	}
	.col-trans {
		width: 26%;
	}
	.col-trans .gloss {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 17px;
		line-height: 1.3;
	}
	.col-audio {
		width: 42%;
	}
	.col-audio audio {
		display: none;
	}
	.player {
		align-items: center;
		display: grid;
		gap: 12px;
		grid-template-columns: auto 1fr auto;
	}
	.play-btn {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--brand);
		cursor: pointer;
		display: inline-flex;
		flex-shrink: 0;
		height: 32px;
		justify-content: center;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
		width: 32px;
	}
	.play-btn:hover {
		background: var(--brand);
		border-color: var(--brand);
		color: oklch(0.98 0.01 85);
	}
	.play-btn.is-playing {
		background: var(--accent);
		border-color: var(--accent);
		color: oklch(0.99 0.005 80);
	}
	.waveform {
		align-items: center;
		cursor: pointer;
		display: flex;
		flex: 1;
		gap: 1.5px;
		height: 28px;
		padding: 4px 0;
	}
	.waveform .bar {
		background: var(--ink-mute);
		border-radius: 1px;
		flex: 1;
		min-width: 2px;
		opacity: 0.4;
		transition: background 0.1s, opacity 0.1s;
	}
	.waveform .bar.played {
		background: var(--brand);
		opacity: 0.9;
	}
	.playing .waveform .bar.played {
		background: var(--accent);
	}
	.timestamp {
		color: var(--ink-mute);
		font-family: var(--font-mono);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.04em;
		min-width: 70px;
		text-align: right;
		white-space: nowrap;
	}

	.col-action {
		width: 200px;
	}
	.row-actions {
		align-items: center;
		display: inline-flex;
		gap: 8px;
	}
	.keep-toggle {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-soft);
		cursor: pointer;
		display: inline-flex;
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		gap: 8px;
		letter-spacing: 0.06em;
		padding: 4px 12px 4px 6px;
		text-transform: uppercase;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}
	.keep-toggle:hover {
		border-color: var(--ink-mute);
		color: var(--ink);
	}
	.keep-toggle .pip {
		align-items: center;
		background: var(--bg);
		border: 1.5px solid var(--ink-mute);
		border-radius: 50%;
		display: inline-flex;
		height: 16px;
		justify-content: center;
		transition: background 0.15s, border-color 0.15s;
		width: 16px;
	}
	.keep-toggle .pip svg {
		height: 10px;
		opacity: 0;
		transition: opacity 0.12s;
		width: 10px;
	}
	.keep-toggle.is-keep {
		background: var(--brand);
		border-color: var(--brand);
		color: oklch(0.98 0.01 85);
	}
	.keep-toggle.is-keep .pip {
		background: oklch(0.98 0.01 85 / 0.18);
		border-color: transparent;
	}
	.keep-toggle.is-keep .pip svg {
		color: oklch(0.98 0.01 85);
		opacity: 1;
	}
	.redo-btn {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--ink-soft);
		cursor: pointer;
		display: inline-flex;
		height: 30px;
		justify-content: center;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
		width: 30px;
	}
	.redo-btn:hover {
		background: var(--surface);
		border-color: var(--accent);
		color: var(--accent);
	}
	.redo-btn.is-on {
		background: var(--accent);
		border-color: var(--accent);
		color: oklch(0.99 0.005 80);
	}

	.session-foot {
		align-items: center;
		border-top: 1px solid var(--line);
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		justify-content: space-between;
		margin-top: 14px;
		padding-top: 22px;
	}
	.session-foot .help {
		color: var(--ink-mute);
		font-family: var(--font-mono);
		font-size: 12px;
		letter-spacing: 0.02em;
	}
	.session-foot .help kbd {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-bottom-width: 2px;
		border-radius: 4px;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 11px;
		margin: 0 2px;
		padding: 1px 6px;
	}
	.processing-skipped-title {
		color: var(--ink);
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 500;
		margin: 16px 0 8px 0;
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
