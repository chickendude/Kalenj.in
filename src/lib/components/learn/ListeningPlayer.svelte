<script lang="ts">
	import { localSetSentenceMissed } from '$lib/learn/local-progress';
	import { toast } from '$lib/stores/toast.svelte';

	type ListeningSentence = {
		id: string;
		kalenjin: string;
		english: string;
		audioUrl: string;
	};

	type Segment = {
		title: string | null;
		/** Repetition count override (daily program); null → session setting. */
		reps: number | null;
		/** Daily program only: sentences are newly introduced on this program day. */
		repeatKalenjinEligible?: boolean;
		sentences: ListeningSentence[];
	};

	export type ListeningSettings = {
		/** Number of passes through each sentence set. */
		reps: number;
		/** Kalenjin audio plays inside each prompt. */
		kalenjinReps: number;
		/** If true, only repeat Kalenjin on first/eligible sentence presentations. */
		repeatKalenjinOnlyNew: boolean;
		/** Shuffle sentence order within each lesson. */
		shuffle: boolean;
	};

	let {
		segments,
		settings,
		missedScope = false,
		local = false,
		onSessionComplete = null
	}: {
		segments: Segment[];
		settings: ListeningSettings;
		missedScope?: boolean;
		/** Signed out: missed flags are written to localStorage instead of the API. */
		local?: boolean;
		onSessionComplete?: (() => void) | null;
	} = $props();

	type Phase = 'idle' | 'english' | 'produce' | 'kalenjin' | 'repeat' | 'done';

	const PHASE_LABELS: Record<Phase, string> = {
		idle: 'Press play to start',
		english: 'Listen: English',
		produce: 'Your turn: say it in Kalenjin',
		kalenjin: 'Listen: Kalenjin',
		repeat: 'Repeat it aloud',
		done: 'Session complete'
	};

	type SessionItem = {
		segmentTitle: string | null;
		sentence: ListeningSentence;
		repetition: number;
		repetitions: number;
		repeatKalenjinEligible: boolean;
	};

	function shuffled<T>(items: T[]): T[] {
		const copy = [...items];
		for (let i = copy.length - 1; i > 0; i -= 1) {
			const j = Math.floor(Math.random() * (i + 1));
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return copy;
	}

	// Playback order is fixed once per session (so prev/next stay stable).
	// svelte-ignore state_referenced_locally — intentional one-time setup
	const seenSentences = new Set<string>();
	// svelte-ignore state_referenced_locally — intentional one-time setup
	const queue: SessionItem[] = segments.flatMap((segment) => {
		if (segment.sentences.length === 0) return [];
		const repetitions = segment.reps ?? settings.reps;
		return Array.from({ length: repetitions }, (_, index) => {
			const pass = settings.shuffle ? shuffled(segment.sentences) : segment.sentences;
			return pass.map((sentence) => {
				const firstInSession = !seenSentences.has(sentence.id);
				seenSentences.add(sentence.id);
				return {
					segmentTitle: segment.title,
					sentence,
					repetition: index + 1,
					repetitions,
					repeatKalenjinEligible:
						(segment.repeatKalenjinEligible ?? true) && firstInSession
				};
			});
		}).flat();
	});

	const totalItems = queue.length;

	let itemIndex = $state(0);
	let kRep = $state(1);
	let phase = $state<Phase>('idle');
	let playing = $state(false);
	let showText = $state(true);
	let flagged = $state(new Set<string>());
	let cleared = $state(new Set<string>());
	let completeNotified = false;

	const item = $derived(queue[itemIndex] ?? null);
	const sentence = $derived(item?.sentence ?? null);
	const itemKalenjinReps = $derived(
		item && (!settings.repeatKalenjinOnlyNew || item.repeatKalenjinEligible)
			? settings.kalenjinReps
			: 1
	);
	const ttsAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
	const speakEnglish = $derived(ttsAvailable);

	let audio: HTMLAudioElement | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	/** Bumped on every manual transition so stale async callbacks no-op. */
	let token = 0;
	let audioDurationMs = 0;

	// macOS ships joke voices (Whisper, Zarvox, Bad News, …) that alphabetical
	// "first en-US voice" picking lands on once the async voice list loads —
	// that's how the prompt ends up literally whispering. Prefer the system
	// default, then well-known conversational voices, and never the novelty set.
	const NOVELTY_VOICES = new Set([
		'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged',
		'fred', 'good news', 'jester', 'junior', 'kathy', 'organ', 'ralph', 'superstar',
		'trinoids', 'whisper', 'wobble', 'zarvox'
	]);
	const PREFERRED_VOICES = [
		'samantha', 'alex', 'daniel', 'karen', 'moira', 'tessa', 'serena',
		'google us english', 'google uk english female', 'google uk english male'
	];

	function pickEnglishVoice(): SpeechSynthesisVoice | null {
		const english = window.speechSynthesis
			.getVoices()
			.filter(
				(voice) =>
					voice.lang.toLowerCase().startsWith('en') &&
					!NOVELTY_VOICES.has(voice.name.toLowerCase().split(' (')[0].trim())
			);
		return (
			english.find((voice) => PREFERRED_VOICES.includes(voice.name.toLowerCase())) ??
			english.find((voice) => voice.default) ??
			english.find((voice) => voice.lang === 'en-US' || voice.lang === 'en_US') ??
			english[0] ??
			null
		);
	}

	function cancelPending() {
		token += 1;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		if (ttsAvailable) window.speechSynthesis.cancel();
		audio?.pause();
	}

	function producePauseMs(): number {
		return Math.max(2500, Math.round(audioDurationMs * 1.2));
	}

	function preloadAudio(url: string) {
		if (!audio) return;
		audioDurationMs = 0;
		const myToken = token;
		audio.src = url;
		audio.addEventListener(
			'loadedmetadata',
			() => {
				if (token !== myToken) return;
				if (Number.isFinite(audio!.duration)) {
					audioDurationMs = audio!.duration * 1000;
				}
			},
			{ once: true }
		);
		audio.load();
	}

	function schedule(ms: number, next: () => void) {
		const myToken = token;
		timer = setTimeout(() => {
			if (token === myToken) next();
		}, ms);
	}

	function enterPhase(next: Phase) {
		cancelPending();
		phase = next;
		if (!playing || !sentence) return;

		if (next === 'english') {
			preloadAudio(sentence.audioUrl);
			if (speakEnglish) {
				const myToken = token;
				// A short beat after cancel() keeps Firefox from garbling the start.
				schedule(80, () => {
					const utterance = new SpeechSynthesisUtterance(sentence.english);
					const voice = pickEnglishVoice();
					if (voice) utterance.voice = voice;
					utterance.rate = 0.95;
					utterance.volume = 1;
					utterance.onend = () => {
						if (token === myToken) enterPhase('produce');
					};
					utterance.onerror = () => {
						if (token === myToken) schedule(3000, () => enterPhase('produce'));
					};
					window.speechSynthesis.speak(utterance);
				});
			} else {
				// No TTS: show the prompt text for a beat.
				schedule(3000, () => enterPhase('produce'));
			}
		} else if (next === 'produce') {
			schedule(producePauseMs(), () => enterPhase('kalenjin'));
		} else if (next === 'kalenjin') {
			if (!audio) return;
			const myToken = token;
			const onEnded = () => {
				if (token === myToken) enterPhase('repeat');
			};
			audio.addEventListener('ended', onEnded, { once: true });
			audio.currentTime = 0;
			audio.play().catch(() => {
				if (token === myToken) {
					toast.error('Could not play the sentence audio.', 3000);
					schedule(1000, () => enterPhase('repeat'));
				}
			});
		} else if (next === 'repeat') {
			schedule(producePauseMs(), () => {
				if (kRep < itemKalenjinReps) {
					kRep += 1;
					enterPhase('kalenjin');
				} else {
					goToItem(itemIndex + 1);
				}
			});
		}
	}

	function goToItem(index: number) {
		cancelPending();
		if (index >= queue.length) {
			phase = 'done';
			playing = false;
			if (!completeNotified) {
				completeNotified = true;
				onSessionComplete?.();
			}
			return;
		}

		itemIndex = Math.max(0, index);
		kRep = 1;
		if (playing) {
			enterPhase('english');
		} else {
			phase = 'idle';
		}
	}

	function togglePlay() {
		if (phase === 'done') {
			completeNotified = true; // replaying doesn't re-fire completion
			playing = true;
			itemIndex = 0;
			kRep = 1;
			enterPhase('english');
			return;
		}
		if (playing) {
			playing = false;
			cancelPending();
		} else {
			// Starting from the user's tap keeps the audio element unlocked on iOS.
			if (!audio) audio = new Audio();
			playing = true;
			enterPhase(phase === 'idle' ? 'english' : phase);
		}
	}

	function flagMissed() {
		if (!sentence) return;
		const id = sentence.id;
		flagged = new Set([...flagged, id]);
		if (local) {
			localSetSentenceMissed(id, true);
			toast.success('Marked to practise again.');
			return;
		}
		void fetch('/api/learn/missed-sentences', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sentenceId: id, missed: true })
		})
			.then((res) => {
				if (res.ok) toast.success('Marked to practise again.');
			})
			.catch(() => {});
	}

	function clearMissed() {
		if (!sentence) return;
		const id = sentence.id;
		cleared = new Set([...cleared, id]);
		if (local) {
			localSetSentenceMissed(id, false);
			toast.success('Nice — cleared from your missed list.');
			return;
		}
		void fetch('/api/learn/missed-sentences', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sentenceId: id, missed: false })
		})
			.then((res) => {
				if (res.ok) toast.success('Nice — cleared from your missed list.');
			})
			.catch(() => {});
	}

	$effect(() => {
		return () => {
			cancelPending();
			audio = null;
		};
	});
</script>

<div class="listening">
	{#if totalItems === 0}
		<div class="listen-card empty">
			<p>No sentences with audio here yet.</p>
			<a class="btn ghost" href="/learn/listen">Pick something else</a>
		</div>
	{:else if phase === 'done'}
		<div class="listen-card empty">
			<div class="done-emoji" aria-hidden="true">🎧</div>
			<h2 class="done-title">Session complete</h2>
			<p>
				You worked through {totalItems}
				{totalItems === 1 ? 'prompt' : 'prompts'}.
			</p>
			<div class="done-actions">
				<button type="button" class="btn" onclick={togglePlay}>Go again</button>
				<a class="btn ghost" href="/learn/listen">Change practice</a>
				<a class="btn ghost" href="/learn">Back to course</a>
			</div>
		</div>
	{:else}
		<div class="listen-card">
			{#if item?.segmentTitle}
				<div class="segment-title">{item.segmentTitle}</div>
			{/if}
			<div class="phase-label" class:active={playing}>{PHASE_LABELS[phase]}</div>

			<div class="counters mono">
				<span>Prompt {itemIndex + 1}/{totalItems}</span>
				{#if item && item.repetitions > 1}
					<span>Repetition {item.repetition}/{item.repetitions}</span>
				{/if}
				{#if itemKalenjinReps > 1}
					<span>Kalenjin {kRep}/{itemKalenjinReps}</span>
				{/if}
			</div>

			{#if sentence && (showText || (phase === 'english' && !speakEnglish))}
				<div class="texts" class:dimmed={showText && (phase === 'english' || phase === 'produce')}>
					{#if showText}
						<p class="kalenjin-text">{sentence.kalenjin}</p>
					{/if}
					<p class="english-text" class:prominent={phase === 'english' && !speakEnglish}>
						{sentence.english}
					</p>
				</div>
			{:else if sentence}
				<p class="texts-hidden">Text hidden — just listen and speak.</p>
			{/if}

			<div class="transport">
				<button
					type="button"
					class="transport-btn"
					onclick={() => goToItem(itemIndex - 1)}
					disabled={itemIndex === 0}
					aria-label="Previous sentence"
				>
					⏮
				</button>
				<button
					type="button"
					class="transport-btn play"
					onclick={togglePlay}
					aria-label={playing ? 'Pause' : 'Play'}
				>
					{playing ? '⏸' : '▶'}
				</button>
				<button
					type="button"
					class="transport-btn"
					onclick={() => goToItem(itemIndex + 1)}
					aria-label="Next sentence"
				>
					⏭
				</button>
			</div>

			<div class="listen-actions">
				<button type="button" class="btn-sm ghost" onclick={() => (showText = !showText)}>
					{showText ? 'Hide text' : 'Show text'}
				</button>
				{#if sentence}
					{#if missedScope}
						<button
							type="button"
							class="btn-sm ghost"
							onclick={clearMissed}
							disabled={cleared.has(sentence.id)}
						>
							{cleared.has(sentence.id) ? '✓ Cleared' : 'Got it now'}
						</button>
					{:else}
						<button
							type="button"
							class="btn-sm ghost missed"
							onclick={flagMissed}
							disabled={flagged.has(sentence.id)}
						>
							{flagged.has(sentence.id) ? '✓ Will practise again' : 'I missed that'}
						</button>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.listening {
		margin: 0 auto;
		max-width: 640px;
	}

	.listen-card {
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg, 10px);
		display: grid;
		gap: 1.1rem;
		justify-items: center;
		padding: 2rem;
		text-align: center;
	}

	.listen-card.empty {
		gap: 0.8rem;
	}

	.done-emoji {
		font-size: 2.5rem;
	}

	.done-title {
		font-family: var(--font-display, inherit);
		margin: 0;
	}

	.done-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		justify-content: center;
	}

	.segment-title {
		color: var(--brand);
		font-size: 13px;
		font-weight: 700;
	}

	.phase-label {
		color: var(--ink-mute);
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.05em;
		min-height: 1.2em;
		text-transform: uppercase;
	}

	.phase-label.active {
		color: var(--accent);
	}

	.counters {
		color: var(--ink-mute);
		display: flex;
		flex-wrap: wrap;
		font-size: 12px;
		gap: 1.2rem;
		justify-content: center;
	}

	.texts {
		display: grid;
		gap: 0.4rem;
		transition: opacity 0.25s;
	}

	.texts.dimmed {
		opacity: 0.35;
	}

	.kalenjin-text {
		font-family: var(--font-display, inherit);
		font-size: 1.45rem;
		margin: 0;
	}

	.english-text {
		color: var(--ink-soft);
		margin: 0;
	}

	.english-text.prominent {
		color: var(--ink);
		font-size: 1.25rem;
		font-weight: 600;
	}

	.texts-hidden {
		color: var(--ink-mute);
		font-style: italic;
		margin: 0;
	}

	.transport {
		align-items: center;
		display: flex;
		gap: 0.9rem;
	}

	.transport-btn {
		align-items: center;
		background: var(--bg-raised);
		border: 1px solid var(--line);
		border-radius: 50%;
		color: var(--ink);
		cursor: pointer;
		display: inline-flex;
		font-size: 16px;
		height: 48px;
		justify-content: center;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
		width: 48px;
	}

	.transport-btn:hover:not(:disabled) {
		border-color: var(--brand);
	}

	.transport-btn:disabled {
		cursor: default;
		opacity: 0.4;
	}

	.transport-btn.play {
		background: var(--brand);
		border-color: var(--brand);
		color: var(--on-brand, #fff);
		font-size: 20px;
		height: 60px;
		width: 60px;
	}

	.listen-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: center;
	}

	.missed {
		color: var(--accent);
	}
</style>
