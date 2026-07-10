export const LOCALES = ['en', 'kln'] as const;

/** UI locale. `kln` is the ISO 639 code for the Kalenjin macrolanguage. */
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_COOKIE = 'locale';

/** Each locale's name written in that locale, for the language switcher. */
export const LOCALE_LABELS: Record<Locale, string> = {
	en: 'English',
	kln: 'Kalenjin'
};

export function parseLocale(value: string | null | undefined): Locale | null {
	return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : null;
}
