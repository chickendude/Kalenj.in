/**
 * Tiny synthesized correct/incorrect chimes for the learning drills — Web
 * Audio only, no asset files. Safe to call anywhere; silently no-ops when
 * AudioContext is unavailable.
 */

let ctx: AudioContext | null = null;

function ensureContext(): AudioContext | null {
	if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
	ctx ??= new AudioContext();
	if (ctx.state === 'suspended') void ctx.resume();
	return ctx;
}

function tone(
	context: AudioContext,
	frequency: number,
	startOffset: number,
	duration: number,
	type: OscillatorType,
	peak: number
) {
	const oscillator = context.createOscillator();
	const gain = context.createGain();
	const start = context.currentTime + startOffset;
	oscillator.type = type;
	oscillator.frequency.value = frequency;
	gain.gain.setValueAtTime(0.0001, start);
	gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
	gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
	oscillator.connect(gain);
	gain.connect(context.destination);
	oscillator.start(start);
	oscillator.stop(start + duration + 0.05);
}

export function playCorrectSound(): void {
	try {
		const context = ensureContext();
		if (!context) return;
		tone(context, 660, 0, 0.12, 'sine', 0.12);
		tone(context, 880, 0.09, 0.16, 'sine', 0.12);
	} catch {
		// Audio is a nicety — never let it break the drill.
	}
}

export function playIncorrectSound(): void {
	try {
		const context = ensureContext();
		if (!context) return;
		tone(context, 220, 0, 0.16, 'triangle', 0.1);
		tone(context, 175, 0.1, 0.18, 'triangle', 0.1);
	} catch {
		// Audio is a nicety — never let it break the drill.
	}
}
