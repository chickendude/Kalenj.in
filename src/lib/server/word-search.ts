type SearchableWord = {
	id: string;
	kalenjin: string;
	translations: string;
};

export function normalizeWordSearchQuery(query: string): string {
	return query.replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreWordMatch(word: SearchableWord, query: string): number {
	const normalizedQuery = normalizeWordSearchQuery(query).toLowerCase();

	if (!normalizedQuery) {
		return 0;
	}

	const lemma = word.kalenjin.toLowerCase();
	const translations = word.translations.toLowerCase();

	if (lemma === normalizedQuery) {
		return 0;
	}

	if (lemma.startsWith(normalizedQuery)) {
		return 1;
	}

	if (translations.split(',').some((entry) => entry.trim() === normalizedQuery)) {
		return 2;
	}

	if (translations.startsWith(normalizedQuery)) {
		return 3;
	}

	if (lemma.includes(normalizedQuery)) {
		return 4;
	}

	if (translations.includes(normalizedQuery)) {
		return 5;
	}

	return 6;
}

export function sortWordSearchResults<T extends SearchableWord>(words: T[], query: string): T[] {
	const normalizedQuery = normalizeWordSearchQuery(query);

	return [...words].sort((left, right) => {
		const scoreDiff = scoreWordMatch(left, normalizedQuery) - scoreWordMatch(right, normalizedQuery);

		if (scoreDiff !== 0) {
			return scoreDiff;
		}

		const lemmaDiff = left.kalenjin.localeCompare(right.kalenjin);
		if (lemmaDiff !== 0) {
			return lemmaDiff;
		}

		return left.translations.localeCompare(right.translations);
	});
}
