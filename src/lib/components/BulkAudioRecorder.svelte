<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/stores/toast.svelte';
	import { dictionaryEntryHref } from '$lib/word-url';
	import BulkAudioReviewActions from './BulkAudioReviewActions.svelte';
	import BulkAudioReviewTable from './BulkAudioReviewTable.svelte';
	import BulkConfirmDialog from './BulkConfirmDialog.svelte';

	type TargetType = 'word' | 'sentence';
	type ItemTargetType = 'word' | 'word-plural' | 'sentence';

	type RecorderItem = {
		id: string;
		primary: string;
		secondary: string;
		targetId?: string;
		targetType?: ItemTargetType;
		badge?: string;
	};

	type Props = {
		items: RecorderItem[];
		targetType?: TargetType;
		onclose?: () => void;
	};

	let { items, targetType = 'word', onclose }: Props = $props();
	let currentItems = $state<RecorderItem[]>(untrack(() => [...items]));

	type SessionState =
		| { kind: 'idle' }
		| { kind: 'priming'; targetItemId: string }
		| { kind: 'speaking'; targetItemId: string; startedAt: number }
		| { kind: 'waiting'; targetItemId: string }
		| {
				kind: 'paused';
				resumeTo:
					| { kind: 'priming'; targetItemId: string }
					| { kind: 'speaking'; targetItemId: string; startedAt: number }
					| { kind: 'waiting'; targetItemId: string };
				pausedAt: number;
		  }
		| { kind: 'finishing' }
		| { kind: 'processing' }
		| { kind: 'reviewing' }
		| { kind: 'saving' }
		| { kind: 'discarding' }
		| { kind: 'error'; message: string };

	type Segment = {
		targetId: string;
		startMs: number;
		endMs: number;
	};

	type ResultRow = {
		targetId: string;
		serverTargetId: string;
		serverTargetType: ItemTargetType;
		audioUrl: string;
		durationSec: number | null;
	};

	type SkippedRow = {
		targetId: string;
		serverTargetId: string;
		serverTargetType: ItemTargetType;
		reason: string;
	};

	type ItemStatus = 'pending' | 'current' | 'captured' | 'skipped';

	const TIMING = {
		word: { silenceHoldMs: 900, maxItemMs: 6000, minItemMs: 200 },
		sentence: { silenceHoldMs: 1500, maxItemMs: 25000, minItemMs: 400 }
	} as const;

	const LABELS = {
		word: { singular: 'word', plural: 'words', primary: 'Kalenjin', secondary: 'Translation' },
		sentence: {
			singular: 'sentence',
			plural: 'sentences',
			primary: 'Kalenjin',
			secondary: 'English'
		}
	} as const;

	const labels = $derived(LABELS[targetType]);
	const timing = $derived(TIMING[targetType]);

	const SILENCE_RMS = 0.012;
	const SPEAKING_RMS = 0.04;
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
	let playingItemId = $state<string | null>(null);
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

	const itemById = $derived(new Map(items.map((it) => [it.id, it])));
	const totalItems = $derived(currentItems.length);
	const segmentByTargetId = $derived(new Map(segments.map((s) => [s.targetId, s])));
	const capturedCount = $derived(segments.length);
	const skippedCount = $derived(skippedSet.size);
	const completedCount = $derived(capturedCount + skippedCount);
	const progressPct = $derived(
		totalItems === 0 ? 0 : Math.round((completedCount / totalItems) * 100)
	);
	const targetItemId = $derived.by(() => {
		if (
			session.kind === 'priming' ||
			session.kind === 'speaking' ||
			session.kind === 'waiting'
		) {
			return session.targetItemId;
		}
		if (session.kind === 'paused') {
			return session.resumeTo.targetItemId;
		}
		return null;
	});
	const currentItem = $derived(targetItemId ? (itemById.get(targetItemId) ?? null) : null);
	const nextItem = $derived.by(() => {
		if (!targetItemId) return null;
		const idx = currentItems.findIndex((it) => it.id === targetItemId);
		for (let i = idx + 1; i < currentItems.length; i += 1) {
			const it = currentItems[i];
			if (!segmentByTargetId.has(it.id) && !skippedSet.has(it.id)) return it;
		}
		return null;
	});
	const isActive = $derived(
		session.kind === 'speaking' || session.kind === 'waiting' || session.kind === 'priming'
	);
	const meterPct = $derived(Math.min(100, Math.round((level / 0.3) * 100)));
	const aboveSpeaking = $derived(level >= SPEAKING_RMS);

	function statusOf(targetId: string): ItemStatus {
		if (segmentByTargetId.has(targetId)) return 'captured';
		if (skippedSet.has(targetId)) return 'skipped';
		if (targetItemId === targetId) return 'current';
		return 'pending';
	}

	function findNextPendingId(): string | null {
		for (const it of currentItems) {
			if (!segmentByTargetId.has(it.id) && !skippedSet.has(it.id)) return it.id;
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
					targetItemId: session.targetItemId,
					startedAt
				};
			}
		} else if (session.kind === 'speaking') {
			if (rms >= SILENCE_RMS) {
				lastVoicedTs = elapsedMs;
			}
			const silenceFor = elapsedMs - lastVoicedTs;
			const spokenFor = elapsedMs - session.startedAt;
			if (spokenFor > timing.maxItemMs) {
				captureSegment(session.targetItemId, session.startedAt, elapsedMs + TAIL_MS);
			} else if (
				silenceFor >= timing.silenceHoldMs &&
				spokenFor >= timing.silenceHoldMs + timing.minItemMs
			) {
				captureSegment(session.targetItemId, session.startedAt, lastVoicedTs + TAIL_MS);
			}
		} else if (session.kind === 'waiting') {
			if (rms >= SPEAKING_RMS) {
				const startedAt = Math.max(0, elapsedMs - LEAD_IN_MS);
				lastVoicedTs = elapsedMs;
				session = {
					kind: 'speaking',
					targetItemId: session.targetItemId,
					startedAt
				};
			}
		}

		if (isActive) {
			rafHandle = requestAnimationFrame(tick);
		}
	}

	function captureSegment(targetId: string, startMs: number, endMs: number) {
		const safeEnd = Math.max(startMs + timing.minItemMs, endMs);
		const filtered = segments.filter((s) => s.targetId !== targetId);
		segments = [...filtered, { targetId, startMs, endMs: safeEnd }];
		advanceToNext();
	}

	function advanceToNext() {
		const nextId = findNextPendingId();
		if (nextId) {
			session = { kind: 'waiting', targetItemId: nextId };
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
		const firstId = currentItems[0]?.id;
		if (!firstId) {
			teardown();
			session = { kind: 'error', message: `No ${labels.plural} to record.` };
			return;
		}
		session = { kind: 'priming', targetItemId: firstId };
		rafHandle = requestAnimationFrame(tick);
	}

	function requestSkip(targetId: string) {
		skipPromptId = targetId;
	}

	function confirmSkip() {
		const targetId = skipPromptId;
		skipPromptId = null;
		if (!targetId) return;
		const next = new Set(skippedSet);
		next.add(targetId);
		skippedSet = next;
		const filtered = segments.filter((s) => s.targetId !== targetId);
		if (filtered.length !== segments.length) segments = filtered;
		if (targetItemId === targetId) advanceToNext();
		if (!isActive) return;
		ensureLoop();
	}

	function restoreItem(targetId: string) {
		if (!skippedSet.has(targetId)) return;
		const next = new Set(skippedSet);
		next.delete(targetId);
		skippedSet = next;
		if (isActive) {
			session = { kind: 'waiting', targetItemId: targetId };
			ensureLoop();
		}
	}

	function redoItem(targetId: string) {
		if (!isActive) return;
		const filtered = segments.filter((s) => s.targetId !== targetId);
		if (filtered.length !== segments.length) segments = filtered;
		const next = new Set(skippedSet);
		if (next.has(targetId)) {
			next.delete(targetId);
			skippedSet = next;
		}
		session = { kind: 'waiting', targetItemId: targetId };
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
						targetItemId: session.targetItemId,
						startedAt: session.startedAt
					}
				: session.kind === 'waiting'
					? { kind: 'waiting' as const, targetItemId: session.targetItemId }
					: { kind: 'priming' as const, targetItemId: session.targetItemId };
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
				session.targetItemId,
				session.startedAt,
				Math.max(session.startedAt + timing.minItemMs, now) + TAIL_MS
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
			session = { kind: 'error', message: `No ${labels.plural} were recorded.` };
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
		formData.append('targetType', targetType);
		formData.append(
			'segments',
			JSON.stringify(
				segments.map((s) => {
					const it = itemById.get(s.targetId);
					return {
						targetId: it?.targetId ?? s.targetId,
						targetType: (it?.targetType ?? targetType) as ItemTargetType,
						startMs: s.startMs,
						endMs: s.endMs
					};
				})
			)
		);

		try {
			const res = await fetch('/api/audio/bulk', { method: 'POST', body: formData });
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(text || `Processing failed: ${res.status}`);
			}
			type ServerResult = {
				targetId: string;
				targetType: ItemTargetType;
				audioUrl: string;
				durationSec: number | null;
			};
			type ServerSkipped = {
				targetId: string;
				targetType: ItemTargetType;
				reason: string;
			};
			const payload = (await res.json()) as {
				results: ServerResult[];
				skipped: ServerSkipped[];
			};
			const serverKeyToItemId = new Map<string, string>();
			for (const it of currentItems) {
				const tt = (it.targetType ?? targetType) as ItemTargetType;
				const tid = it.targetId ?? it.id;
				serverKeyToItemId.set(`${tt}:${tid}`, it.id);
			}
			function findItemId(targetType: ItemTargetType, targetId: string): string {
				return serverKeyToItemId.get(`${targetType}:${targetId}`) ?? targetId;
			}
			resultRows = payload.results.map((r) => ({
				targetId: findItemId(r.targetType, r.targetId),
				serverTargetId: r.targetId,
				serverTargetType: r.targetType,
				audioUrl: r.audioUrl,
				durationSec: r.durationSec
			}));
			processingSkipped = payload.skipped.map((s) => ({
				targetId: findItemId(s.targetType, s.targetId),
				serverTargetId: s.targetId,
				serverTargetType: s.targetType,
				reason: s.reason
			}));
			const initialStates = new Map<string, ReviewState>();
			for (const r of resultRows) initialStates.set(r.targetId, 'keep');
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

	function stateOf(targetId: string): ReviewState {
		return reviewStates.get(targetId) ?? 'keep';
	}

	function setReviewState(targetId: string, next: ReviewState) {
		const m = new Map(reviewStates);
		m.set(targetId, next);
		reviewStates = m;
	}

	function toggleKeepSkip(targetId: string) {
		const cur = stateOf(targetId);
		setReviewState(targetId, cur === 'keep' ? 'skip' : 'keep');
	}

	function toggleRedo(targetId: string) {
		const cur = stateOf(targetId);
		setReviewState(targetId, cur === 'redo' ? 'keep' : 'redo');
	}

	const keepRows = $derived(resultRows.filter((r) => stateOf(r.targetId) === 'keep'));
	const skipRows = $derived(resultRows.filter((r) => stateOf(r.targetId) === 'skip'));
	const redoRows = $derived(resultRows.filter((r) => stateOf(r.targetId) === 'redo'));
	const keepCount = $derived(keepRows.length);
	const redoCount = $derived(redoRows.length);
	const totalAudioSec = $derived(keepRows.reduce((sum, r) => sum + (r.durationSec ?? 0), 0));

	async function postCommit(
		keep: { targetId: string; targetType: ItemTargetType; audioUrl: string }[],
		discard: string[]
	): Promise<Set<string>> {
		const res = await fetch('/api/audio/bulk/commit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ targetType, keep, discard })
		});
		if (!res.ok) {
			const text = await res.text().catch(() => '');
			throw new Error(text || `Save failed: ${res.status}`);
		}
		const payload = (await res.json()) as {
			committed: { targetId: string; targetType: ItemTargetType; audioUrl: string }[];
		};
		return new Set(payload.committed.map((c) => `${c.targetType}:${c.targetId}`));
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
			const committedKeys = await postCommit(
				keep.map((r) => ({
					targetId: r.serverTargetId,
					targetType: r.serverTargetType,
					audioUrl: r.audioUrl
				})),
				skip.map((r) => r.audioUrl)
			);
			const newlySaved = keep.filter((r) =>
				committedKeys.has(`${r.serverTargetType}:${r.serverTargetId}`)
			);
			await invalidateAll();
			if (newlySaved.length > 0) {
				const noun = newlySaved.length === 1 ? labels.singular : labels.plural;
				toast.success(`Saved ${newlySaved.length} ${noun}.`);
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
			for (const r of redo) remainingStates.set(r.targetId, 'redo');
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
			const committedKeys = await postCommit(
				keep.map((r) => ({
					targetId: r.serverTargetId,
					targetType: r.serverTargetType,
					audioUrl: r.audioUrl
				})),
				[...skip.map((r) => r.audioUrl), ...redo.map((r) => r.audioUrl)]
			);
			const newlySaved = keep.filter((r) =>
				committedKeys.has(`${r.serverTargetType}:${r.serverTargetId}`)
			);
			await invalidateAll();
			if (newlySaved.length > 0) {
				const noun = newlySaved.length === 1 ? labels.singular : labels.plural;
				toast.success(`Saved ${newlySaved.length} ${noun}.`);
			}

			// Restart the bulk session with only the redo'd items.
			const redoIds = new Set(redo.map((r) => r.targetId));
			const redoItems = currentItems.filter((it) => redoIds.has(it.id));
			currentItems = redoItems;
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
				body: JSON.stringify({ targetType, keep: [], discard: urls })
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

	function playRow(targetId: string) {
		if (playingItemId === targetId) {
			stopPlayback();
			return;
		}
		const el = audioEls.get(targetId);
		if (!el) return;
		stopPlayback();
		playingItemId = targetId;
		playProgress = 0;
		el.currentTime = 0;
		el.ontimeupdate = () => {
			if (!el.duration || !Number.isFinite(el.duration)) return;
			playProgress = el.currentTime / el.duration;
		};
		el.onended = () => {
			if (playingItemId === targetId) {
				playingItemId = null;
				playProgress = 0;
			}
		};
		el.play().catch(() => {
			playingItemId = null;
			playProgress = 0;
		});
	}

	function playAll() {
		stopPlayback();
		const ids = resultRows
			.filter((r) => stateOf(r.targetId) === 'keep')
			.map((r) => r.targetId);
		if (ids.length === 0) return;
		playSequence = ids;
		playSequenceIndex = 0;
		playNextInSequence();
	}

	function playNextInSequence() {
		if (playSequenceIndex >= playSequence.length) {
			playingItemId = null;
			playProgress = 0;
			playSequence = [];
			return;
		}
		const targetId = playSequence[playSequenceIndex];
		const el = audioEls.get(targetId);
		if (!el) {
			playSequenceIndex += 1;
			playNextInSequence();
			return;
		}
		playingItemId = targetId;
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

	function seekTo(targetId: string, fraction: number) {
		const el = audioEls.get(targetId);
		if (!el || !el.duration || !Number.isFinite(el.duration)) return;
		el.currentTime = Math.max(0, Math.min(el.duration, el.duration * fraction));
		playProgress = fraction;
		if (playingItemId !== targetId) {
			playRow(targetId);
		}
	}

	function stopPlayback() {
		if (playingItemId) {
			const el = audioEls.get(playingItemId);
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
		playingItemId = null;
		playProgress = 0;
		playSequence = [];
		playSequenceIndex = 0;
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
		const id = targetItemId;
		const container = listEl;
		if (!id || !container) return;
		const row = container.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`);
		if (!row) return;
		const target = row.offsetTop - (container.clientHeight - row.offsetHeight) / 2;
		const max = container.scrollHeight - container.clientHeight;
		container.scrollTo({
			top: Math.max(0, Math.min(max, target)),
			behavior: 'smooth'
		});
	});

	$effect(() => {
		const id = playingItemId;
		if (!id) return;
		const row = document.querySelector<HTMLElement>(`tr[data-row-item-id="${CSS.escape(id)}"]`);
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
				You'll record <strong>{totalItems}</strong> {totalItems === 1 ? labels.singular : labels.plural} in one
				continuous take. Pause for about a second between {labels.plural}; the recorder will advance
				automatically.
			</p>
			<ul class="bulk-tips">
				<li>Speak at a steady volume.</li>
				<li>The list shows every {labels.singular}'s status as you go — click <em>Redo</em> on any captured {labels.singular} to re-record it.</li>
				<li>Use <em>Skip</em> on a {labels.singular} you don't want to record this session.</li>
			</ul>

			<div class="bulk-preview-head">
				<span class="bulk-preview-label">{labels.plural[0].toUpperCase()}{labels.plural.slice(1)} in this session</span>
				<span class="muted">{totalItems}</span>
			</div>
			<ol class="bulk-list bulk-preview-list">
				{#each currentItems as item, i (item.id)}
					<li class="bulk-list-row bulk-preview-row">
						<span class="bulk-preview-index">{i + 1}.</span>
						<span class="bulk-list-word">
							{#if item.badge}
								<span class="bulk-list-badge">{item.badge}</span>
							{/if}
							{item.primary}
						</span>
						<span class="bulk-list-trans muted">{item.secondary}</span>
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
					{capturedCount} captured · {skippedCount} skipped · {totalItems - completedCount} pending
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
					Speak the first {labels.singular} when you're ready…
				{:else if session.kind === 'speaking'}
					<span class="bulk-dot" aria-hidden="true"></span>
					Recording — pause briefly when done.
				{:else if session.kind === 'waiting'}
					<span class="bulk-dot bulk-dot-wait" aria-hidden="true"></span>
					Speak now: next {labels.singular}.
				{:else if session.kind === 'paused'}
					<span class="bulk-dot bulk-dot-wait" aria-hidden="true"></span>
					Recording paused.
				{:else if session.kind === 'finishing'}
					Finalising recording…
				{/if}
			</div>

			{#if currentItem}
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
					<div class="bulk-word" class:bulk-word-sentence={targetType === 'sentence'}>
						<div class="bulk-word-current">
							{#if currentItem.badge}
								<span class="bulk-word-badge">{currentItem.badge}</span>
							{/if}
							{currentItem.primary}
						</div>
						<div class="bulk-word-translation">{currentItem.secondary}</div>
					</div>
				</div>
				{#if nextItem}
					<div class="bulk-word-next">
						<span class="muted">Next:</span> {nextItem.primary}
					</div>
				{/if}
				{#if targetType === 'sentence' && session.kind === 'speaking'}
					<div class="bulk-actions next-action-row">
						<button type="button" class="btn-sm" onclick={stopEarly}>
							Done with this sentence →
						</button>
					</div>
				{/if}
			{/if}

			<div class="bulk-meter" aria-hidden="true">
				<div class="bulk-meter-fill" style:width="{meterPct}%"></div>
			</div>

			<div
				class="bulk-list"
				role="list"
				aria-label={`${labels.plural[0].toUpperCase()}${labels.plural.slice(1)} in this session`}
				bind:this={listEl}
			>
				{#each currentItems as item (item.id)}
					{@const status = statusOf(item.id)}
					<div
						class="bulk-list-row"
						class:current={status === 'current'}
						role="listitem"
						data-item-id={item.id}
					>
						<span class="bulk-list-status status-{status}" aria-label={status}>
							{#if status === 'captured'}✓{:else if status === 'skipped'}✕{:else if status === 'current'}●{:else}·{/if}
						</span>
						<span class="bulk-list-word">
							{#if item.badge}
								<span class="bulk-list-badge">{item.badge}</span>
							{/if}
							{item.primary}
						</span>
						<span class="bulk-list-trans muted">{item.secondary}</span>
						<span class="bulk-list-actions">
							{#if status === 'captured'}
								<button
									type="button"
									class="btn-mini"
									onclick={() => redoItem(item.id)}
									disabled={session.kind === 'finishing'}
								>
									Redo
								</button>
								<button
									type="button"
									class="btn-mini ghost"
									onclick={() => requestSkip(item.id)}
									disabled={session.kind === 'finishing'}
								>
									Skip
								</button>
							{:else if status === 'skipped'}
								<button
									type="button"
									class="btn-mini"
									onclick={() => restoreItem(item.id)}
									disabled={session.kind === 'finishing'}
								>
									Restore
								</button>
							{:else if status === 'pending' || status === 'current'}
								<button
									type="button"
									class="btn-mini ghost"
									onclick={() => requestSkip(item.id)}
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

			<BulkAudioReviewActions
				playing={playingItemId !== null}
				{keepCount}
				{redoCount}
				singular={labels.singular}
				plural={labels.plural}
				onPlayAll={playAll}
				onStop={stopPlayback}
				onDiscard={discardAll}
				onSave={saveSelected}
				onRerecord={requestRerecord}
			/>

			<BulkAudioReviewTable
				rows={resultRows}
				{itemById}
				rowStates={reviewStates}
				{playingItemId}
				{playProgress}
				{targetType}
				primaryLabel={labels.primary}
				secondaryLabel={labels.secondary}
				onPlay={playRow}
				onSeek={seekTo}
				onToggleKeepSkip={toggleKeepSkip}
				onToggleRedo={toggleRedo}
				registerAudio={(targetId, el) => {
					if (el) audioEls.set(targetId, el);
					else audioEls.delete(targetId);
				}}
			/>

			{#if processingSkipped.length > 0}
				<h4 class="processing-skipped-title">Skipped during processing</h4>
				<ul class="bulk-skipped">
					{#each processingSkipped as row (row.targetId)}
						{@const it = itemById.get(row.targetId)}
						<li><strong>{it?.primary ?? row.targetId}</strong> — {row.reason}</li>
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

<BulkConfirmDialog
	open={skipPromptId !== null}
	labelledby="skip-title"
	onclose={() => (skipPromptId = null)}
>
	{#if skipPromptId}
		{@const skipItem = itemById.get(skipPromptId)}
		{@const detailHref =
			targetType === 'word'
				? skipItem
					? dictionaryEntryHref({ id: skipPromptId, kalenjin: skipItem.primary })
					: `/dictionary/${skipPromptId}`
				: `/corpus/${skipPromptId}`}
		{@const detailLabel = targetType === 'word' ? 'Open in dictionary →' : 'Open in corpus →'}
		<h3 id="skip-title">Double-check this entry</h3>
		{#if skipItem}
			<div class="skip-preview">
				<div class="skip-preview-word">{skipItem.primary}</div>
				<div class="skip-preview-trans">{skipItem.secondary}</div>
			</div>
		{/if}
		<p>
			Make sure the {labels.primary} and {labels.secondary.toLowerCase()} are correct before
			skipping. If something looks off, open the entry to fix it; if it's right but you can't
			record it now, you can skip.
		</p>
		<div class="bulk-actions">
			<button type="button" class="btn" onclick={confirmSkip}>Skip this {labels.singular}</button>
			{#if skipItem}
				<a class="btn ghost" href={detailHref} target="_blank" rel="noopener">
					{detailLabel}
				</a>
			{/if}
			<button type="button" class="btn ghost" onclick={() => (skipPromptId = null)}>
				Cancel
			</button>
		</div>
	{/if}
</BulkConfirmDialog>

<BulkConfirmDialog
	open={confirmRerecord}
	labelledby="rerec-title"
	onclose={() => (confirmRerecord = false)}
>
	<h3 id="rerec-title">Save and re-record?</h3>
	<p>
		{keepCount} kept {keepCount === 1 ? labels.singular : labels.plural} will be saved, then
		you'll start a new recording session for {redoCount}
		{redoCount === 1 ? labels.singular : labels.plural}. Skipped clips will be discarded.
	</p>
	<div class="bulk-actions">
		<button type="button" class="btn primary" onclick={executeRerecord}>
			Save and re-record
		</button>
		<button type="button" class="btn ghost" onclick={() => (confirmRerecord = false)}>
			Cancel
		</button>
	</div>
</BulkConfirmDialog>

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
	.bulk-word-sentence .bulk-word-current {
		font-size: 22px;
		line-height: 1.35;
	}
	.bulk-word-sentence .bulk-word-translation {
		font-size: 15px;
		margin-top: 8px;
	}
	.bulk-word-translation {
		color: var(--ink-soft);
		font-size: 16px;
		margin-top: 4px;
	}
	.next-action-row {
		justify-content: center;
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
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bulk-list-trans {
		font-size: 13px;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bulk-list-actions {
		display: flex;
		gap: 4px;
	}
	.bulk-list-badge {
		background: color-mix(in oklch, var(--accent) 18%, transparent);
		border: 1px solid color-mix(in oklch, var(--accent) 30%, var(--line));
		border-radius: 4px;
		color: var(--ink-soft);
		display: inline-block;
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.1em;
		margin-right: 6px;
		padding: 1px 5px;
		text-transform: uppercase;
		vertical-align: middle;
	}
	.bulk-word-badge {
		background: color-mix(in oklch, var(--accent) 18%, transparent);
		border: 1px solid color-mix(in oklch, var(--accent) 30%, var(--line));
		border-radius: 6px;
		color: var(--ink-soft);
		display: inline-block;
		font-family: var(--font-sans, inherit);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.12em;
		margin-right: 10px;
		padding: 2px 8px;
		text-transform: uppercase;
		vertical-align: middle;
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
