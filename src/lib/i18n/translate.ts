import { en, type MessageKey } from './messages/en';
import { kln } from './messages/kln';
import type { Locale } from './locale';

export type MessageParams = Record<string, string | number>;

/** Per-key message overrides for one locale (static catalog or database rows). */
export type MessageOverrides = Partial<Record<MessageKey, string>>;

const STATIC_CATALOGS: Record<Locale, MessageOverrides> = {
	en: {},
	kln
};

const PLACEHOLDER_REGEX = /\{(\w+)\}/g;

/**
 * Resolve a message for a locale and interpolate `{name}` placeholders.
 * Lookup order: runtime `overrides` (edited at /admin/translations), then the
 * locale's static catalog, then the English source catalog.
 */
export function translate(
	locale: Locale,
	key: MessageKey,
	params?: MessageParams,
	overrides?: MessageOverrides
): string {
	const template = overrides?.[key] ?? STATIC_CATALOGS[locale][key] ?? en[key];
	if (!params) return template;
	return template.replace(PLACEHOLDER_REGEX, (match, name: string) =>
		name in params ? String(params[name]) : match
	);
}
