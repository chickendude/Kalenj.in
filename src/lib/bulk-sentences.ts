export type ParsedBulkSentence = {
	lineNumber: number;
	kalenjin: string;
	english: string;
};

export type BulkSentenceWarning = {
	field: 'kalenjin' | 'english';
	code: 'missing-final-punctuation' | 'middle-capitalized-word';
	message: string;
	words?: string[];
};

export type BulkSentenceReviewRow = ParsedBulkSentence & {
	warnings: BulkSentenceWarning[];
};

const FINAL_PUNCTUATION_REGEX = /(?:[.!?]|…)$/u;
const LETTER_REGEX = /\p{L}/u;
const LEADING_UPPERCASE_REGEX = /^\P{L}*\p{Lu}/u;

function capitalizeFirstWord(value: string): string {
	return value.trim().replace(LETTER_REGEX, (letter) => letter.toLocaleUpperCase());
}

function ensureFinalPunctuation(value: string): { value: string; addedPunctuation: boolean } {
	const trimmed = value.trim();
	if (!trimmed || FINAL_PUNCTUATION_REGEX.test(trimmed)) {
		return { value: trimmed, addedPunctuation: false };
	}

	return { value: `${trimmed}.`, addedPunctuation: true };
}

function findMiddleCapitalizedWords(value: string): string[] {
	return value
		.trim()
		.split(/\s+/)
		.slice(1)
		.filter((word) => LEADING_UPPERCASE_REGEX.test(word))
		.map((word) => word.replace(/^\P{L}+|\P{L}+$/gu, ''));
}

function normalizeField(
	value: string,
	field: BulkSentenceWarning['field'],
	options: { checkCapitalization: boolean }
): { value: string; warnings: BulkSentenceWarning[] } {
	const warnings: BulkSentenceWarning[] = [];
	const capitalized = options.checkCapitalization ? capitalizeFirstWord(value) : value.trim();
	const punctuated = ensureFinalPunctuation(capitalized);

	if (punctuated.addedPunctuation) {
		warnings.push({
			field,
			code: 'missing-final-punctuation',
			message: 'Confirm punctuation'
		});
	}

	const middleCapitalizedWords = options.checkCapitalization
		? findMiddleCapitalizedWords(punctuated.value)
		: [];
	if (middleCapitalizedWords.length > 0) {
		warnings.push({
			field,
			code: 'middle-capitalized-word',
			message: 'Check capitalization',
			words: middleCapitalizedWords
		});
	}

	return { value: punctuated.value, warnings };
}

export function parseBulkSentenceText(input: string): ParsedBulkSentence[] {
	const parsed: ParsedBulkSentence[] = [];

	for (const [index, rawLine] of input.split(/\r?\n/).entries()) {
		const lineNumber = index + 1;
		const line = rawLine.trim();

		if (!line) continue;

		const tabParts = line.includes('\t')
			? line
					.split('\t')
					.map((part) => part.trim())
					.filter(Boolean)
			: null;
		const dashIndex = line.indexOf(' – ');
		const parts = tabParts ?? (dashIndex >= 0 ? [line.slice(0, dashIndex), line.slice(dashIndex + 3)] : null);

		if (!parts || parts.length !== 2) {
			throw new Error(`Line ${lineNumber}: use either a tab or " – " between Kalenjin and English.`);
		}

		const [kalenjin, english] = parts.map((part) => part.trim());
		if (!kalenjin || !english) {
			throw new Error(`Line ${lineNumber}: Kalenjin and English are both required.`);
		}

		parsed.push({ lineNumber, kalenjin, english });
	}

	if (parsed.length === 0) {
		throw new Error('Paste at least one sentence pair.');
	}

	return parsed;
}

export function normalizeBulkSentenceForReview(sentence: ParsedBulkSentence): BulkSentenceReviewRow {
	const kalenjin = normalizeField(sentence.kalenjin, 'kalenjin', {
		checkCapitalization: true
	});
	const english = normalizeField(sentence.english, 'english', {
		checkCapitalization: false
	});

	return {
		lineNumber: sentence.lineNumber,
		kalenjin: kalenjin.value,
		english: english.value,
		warnings: [...kalenjin.warnings, ...english.warnings]
	};
}

export function buildBulkSentenceReviewRows(input: string): BulkSentenceReviewRow[] {
	return parseBulkSentenceText(input).map(normalizeBulkSentenceForReview);
}
