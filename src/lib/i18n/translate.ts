import { en, type MessageKey } from './messages/en';
import { kln } from './messages/kln';
import type { Locale } from './locale';

export type MessageParams = Record<string, string | number>;

const CATALOGS: Record<Locale, Partial<Record<MessageKey, string>>> = {
	en: {},
	kln
};

const PLACEHOLDER_REGEX = /\{(\w+)\}/g;

/**
 * Resolve a message for a locale, falling back to English for keys the
 * locale's catalog does not cover, and interpolating `{name}` placeholders.
 */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
	const template = CATALOGS[locale][key] ?? en[key];
	if (!params) return template;
	return template.replace(PLACEHOLDER_REGEX, (match, name: string) =>
		name in params ? String(params[name]) : match
	);
}

// A character that cannot appear in message text, used to mark where the
// slot content belongs so the caller can split around it.
const SLOT_SENTINEL = '\u0000';

/**
 * Resolve a message that embeds styled or linked content — e.g. a link in
 * the middle of a sentence — and split it around the named slot. The message
 * writes `{slot}` wherever the content belongs (so translations control word
 * order); the caller renders its markup between the returned parts.
 */
export function translateWithSlot(
	locale: Locale,
	key: MessageKey,
	slot: string,
	params?: MessageParams
): string[] {
	return translate(locale, key, { ...params, [slot]: SLOT_SENTINEL }).split(SLOT_SENTINEL);
}
