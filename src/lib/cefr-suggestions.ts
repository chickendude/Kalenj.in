export type CefrTargetBase = {
	id: string;
	english: string;
	coveredByLessonWordId: string | null;
};

function removeParentheticalContent(value: string): string {
	let depth = 0;
	let result = '';

	for (const char of value) {
		if (char === '(') {
			depth += 1;
			continue;
		}

		if (char === ')' && depth > 0) {
			depth -= 1;
			continue;
		}

		if (depth === 0) {
			result += char;
		}
	}

	return result;
}

function normalizeTerm(value: string): string {
	return removeParentheticalContent(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Parse a word's translations string into individual search terms.
 * Splits by comma, removes parenthetical content, trims and lowercases.
 *
 * "hello, hi (informal)" -> ["hello", "hi"]
 * "run (fast), walk"     -> ["run", "walk"]
 * "(something), hello"   -> ["hello"]
 */
export function parseTranslationTerms(translations: string): string[] {
	return translations
		.split(',')
		.map(normalizeTerm)
		.filter((t) => t.length > 0);
}

/**
 * Find CEFR targets whose english field exactly matches one of the translation terms.
 * Excludes targets already in coveredTargetIds (attached to this word)
 * and targets covered by any other word.
 */
export function suggestCefrTargets<T extends CefrTargetBase>(
	translations: string,
	allTargets: T[],
	coveredTargetIds: Set<string>
): T[] {
	const terms = new Set(parseTranslationTerms(translations));
	if (terms.size === 0) return [];

	return allTargets.filter(
		(target) =>
			!coveredTargetIds.has(target.id) &&
			!target.coveredByLessonWordId &&
			terms.has(normalizeTerm(target.english))
	);
}
