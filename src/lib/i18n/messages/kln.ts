import type { MessageKey } from './en';

/**
 * Kalenjin UI messages. Any key missing here falls back to English, so this
 * catalog can be filled in incrementally — add a key from `en.ts` with its
 * Kalenjin rendering and it takes effect everywhere the key is used.
 *
 * The entries below are a draft starter set and should be reviewed by a
 * fluent speaker before being treated as authoritative.
 */
export const kln: Partial<Record<MessageKey, string>> = {
	'nav.dictionary': 'Kamusi',
	'language.label': 'Kutit',
	'search.placeholder': "Cheng' ng'olyot…",
	'search.ariaLabel': "Cheng' ng'olyot",
	'home.search.placeholder': "Cheng' ng'olyot — Kalenjin anan English",
	'home.headword.one': "ng'olyot",
	'home.headword.other': "ng'alek",
	'home.wordOfDay': "Ng'olyotab betut"
};
