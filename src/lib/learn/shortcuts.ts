/**
 * Lightweight event bus for learn-mode keyboard shortcuts. The player (or
 * review session) owns the keydown listener and emits semantic actions; the
 * active step card subscribes and reacts to the ones it supports.
 */

export type LearnShortcutAction = 'audio' | 'translate' | 'hint';

const EVENT_NAME = 'kalenjin-learn-shortcut';

export function emitLearnShortcut(action: LearnShortcutAction): void {
	window.dispatchEvent(new CustomEvent<LearnShortcutAction>(EVENT_NAME, { detail: action }));
}

export function onLearnShortcut(handler: (action: LearnShortcutAction) => void): () => void {
	const listener = (event: Event) => handler((event as CustomEvent<LearnShortcutAction>).detail);
	window.addEventListener(EVENT_NAME, listener);
	return () => window.removeEventListener(EVENT_NAME, listener);
}

/** Shared key → action mapping used by both the lesson player and reviews. */
export function shortcutActionForKey(key: string): LearnShortcutAction | null {
	if (key === 'a' || key === 'A') return 'audio';
	if (key === 't' || key === 'T') return 'translate';
	if (key === 'h' || key === 'H') return 'hint';
	return null;
}
