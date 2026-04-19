import type { KalenjinSearchWord } from './kalenjin-word-search';
import { normalizeKalenjinSearchQuery, sortKalenjinSearchResults } from './kalenjin-word-search';

// Compatibility wrapper around the shared Kalenjin search helper.
export function normalizeWordSearchQuery(query: string): string {
	return normalizeKalenjinSearchQuery(query);
}

export function sortWordSearchResults<T extends KalenjinSearchWord>(words: T[], query: string): T[] {
	return sortKalenjinSearchResults(words, query);
}
