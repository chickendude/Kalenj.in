const TRANSLATION_DELIMITER = ';';
const PARENTHETICAL_SEGMENT_REGEX = /\(([^()]*)\)/g;
const NUMERIC_TRANSLATION_QUERY_REGEX = /^\d+$/;
const MULTIPLE_WHITESPACE_REGEX = /\s+/g;

export function parseTranslationList(translations: string): string[] {
	return translations
		.split(TRANSLATION_DELIMITER)
		.map((translation) => translation.trim())
		.filter((translation) => translation.length > 0);
}

export function firstTranslation(translations: string): string {
	return parseTranslationList(translations)[0] ?? '';
}

function normalizeTranslationSearchValue(value: string): string {
	return value.trim().toLocaleLowerCase().replace(MULTIPLE_WHITESPACE_REGEX, ' ');
}

function extractParentheticalSegments(translation: string): string[] {
	return Array.from(translation.matchAll(PARENTHETICAL_SEGMENT_REGEX), (match) =>
		normalizeTranslationSearchValue(match[1] ?? '')
	).filter((segment) => segment.length > 0);
}

export function isNumericTranslationSearchQuery(query: string): boolean {
	return NUMERIC_TRANSLATION_QUERY_REGEX.test(normalizeTranslationSearchValue(query));
}

export function scoreTranslationMatch(translations: string, query: string): number {
	const normalizedQuery = normalizeTranslationSearchValue(query);
	if (!normalizedQuery) {
		return Number.POSITIVE_INFINITY;
	}

	const numericQuery = isNumericTranslationSearchQuery(normalizedQuery);
	const translationTerms = parseTranslationList(translations).map(normalizeTranslationSearchValue);
	let bestScore = Number.POSITIVE_INFINITY;

	for (const term of translationTerms) {
		if (!term) {
			continue;
		}

		if (numericQuery) {
			for (const segment of extractParentheticalSegments(term)) {
				if (segment === normalizedQuery) {
					bestScore = Math.min(bestScore, 0);
				} else if (segment.startsWith(normalizedQuery)) {
					bestScore = Math.min(bestScore, 1);
				} else if (segment.includes(normalizedQuery)) {
					bestScore = Math.min(bestScore, 2);
				}
			}
		}

		if (term === normalizedQuery) {
			bestScore = Math.min(bestScore, 0);
		} else if (term.startsWith(normalizedQuery)) {
			bestScore = Math.min(bestScore, numericQuery ? 4 : 1);
		} else if (term.includes(normalizedQuery)) {
			bestScore = Math.min(bestScore, numericQuery ? 5 : 2);
		}
	}

	return bestScore;
}

export function sortTranslationSearchResults<T extends { kalenjin: string; translations: string }>(
	words: T[],
	query: string
): T[] {
	const normalizedQuery = normalizeTranslationSearchValue(query);
	if (!normalizedQuery) {
		return [...words].sort(
			(left, right) =>
				left.kalenjin.localeCompare(right.kalenjin) ||
				left.translations.localeCompare(right.translations)
		);
	}

	return [...words].sort((left, right) => {
		const scoreDifference =
			scoreTranslationMatch(left.translations, normalizedQuery) -
			scoreTranslationMatch(right.translations, normalizedQuery);
		if (scoreDifference !== 0) {
			return scoreDifference;
		}

		return (
			left.kalenjin.localeCompare(right.kalenjin) ||
			left.translations.localeCompare(right.translations)
		);
	});
}
