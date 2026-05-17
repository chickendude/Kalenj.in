import { browser } from '$app/environment';

export type AddWordIntent = 'stay' | 'open';

export const ADD_WORD_INTENT_LABELS: Record<AddWordIntent, string> = {
	stay: 'Create & add another',
	open: 'Create & open'
};

const STORAGE_KEY = 'dictionary-add-word-intent';

export function readAddWordIntent(): AddWordIntent {
	if (!browser) return 'stay';
	return localStorage.getItem(STORAGE_KEY) === 'open' ? 'open' : 'stay';
}

export function saveAddWordIntent(intent: AddWordIntent): void {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, intent);
}
