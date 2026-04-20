const TRANSLATION_DELIMITER = ';';

export function parseTranslationList(translations: string): string[] {
	return translations
		.split(TRANSLATION_DELIMITER)
		.map((translation) => translation.trim())
		.filter((translation) => translation.length > 0);
}

export function firstTranslation(translations: string): string {
	return parseTranslationList(translations)[0] ?? '';
}
