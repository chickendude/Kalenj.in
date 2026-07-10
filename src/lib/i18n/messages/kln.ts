import type { MessageKey } from './en';

/**
 * Kalenjin UI messages. Any key missing here falls back to English, so this
 * catalog can be filled in incrementally.
 *
 * This file is the single source of the Kalenjin text. Edit it at
 * /admin/translations while running the site locally (which rewrites this
 * file) or by hand, then commit the changes — they ship with the code.
 * Have a fluent speaker review entries before treating them as authoritative.
 */
export const kln: Partial<Record<MessageKey, string>> = {
	'nav.dictionary': 'Tikshenari',
	'language.label': 'Kutit',
	'search.placeholder': "Cheng' ng'olyot…",
	'search.ariaLabel': "Cheng' ng'olyot",
	'home.headword.one': "ng'olyot",
	'home.headword.other': "ng'alek",
	'home.search.placeholder': "Cheng' ng'olyot — Kalenjin anan English",
	'home.wordOfDay': "Ng'olyotab betut"
};
