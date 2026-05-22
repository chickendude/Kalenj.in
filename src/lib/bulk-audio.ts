// Pure helpers extracted from BulkAudioRecorder.svelte. No component state,
// runs, or DOM/audio APIs here — keep this module side-effect free and testable.

/** Deterministic decorative waveform bars for a clip, seeded by a number so the
 * same clip always renders the same shape. `lengthSec` gently scales amplitude. */
export function seededWaveform(seed: number, len: number, lengthSec: number): number[] {
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

/** Stable non-zero hash of a string id (used to seed waveforms per item). */
export function hashId(id: string): number {
	let h = 0;
	for (let i = 0; i < id.length; i += 1) {
		h = (h * 31 + id.charCodeAt(i)) | 0;
	}
	return Math.abs(h) || 1;
}

/** Format seconds as `0:SS.cs` (minutes:seconds.centiseconds). */
export function fmtSecMs(s: number): string {
	const sec = Math.floor(s);
	const cs = Math.round((s - sec) * 100);
	return `0:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
