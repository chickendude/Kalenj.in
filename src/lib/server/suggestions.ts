import type { PartOfSpeech } from '@prisma/client';
import { isPartOfSpeech } from '$lib/parts-of-speech';

export const MAX_KALENJIN_LENGTH = 1000;
export const MAX_TRANSLATIONS_LENGTH = 500;
export const MAX_NOTES_LENGTH = 2000;
export const MAX_ENGLISH_LENGTH = 1000;
export const MAX_ALT_SPELLINGS_LENGTH = 500;
export const MAX_PLURAL_LENGTH = 200;

export type WordSuggestionInput = {
	kalenjin: string;
	translations: string;
	partOfSpeech: PartOfSpeech | null;
	notes: string | null;
	alternativeSpellings: string | null;
	pluralForm: string | null;
	isPluralOnly: boolean;
	isSingularOnly: boolean;
	alternativePluralForms: string | null;
	presentAnee: string | null;
	presentInyee: string | null;
	presentInee: string | null;
	presentEchek: string | null;
	presentOkwek: string | null;
	presentIchek: string | null;
};

export type SentenceSuggestionInput = {
	kalenjin: string;
	english: string;
	notes: string | null;
};

export type SuggestionParseResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: string };

function readTrimmed(formData: FormData, key: string): string {
	return String(formData.get(key) ?? '').trim();
}

/**
 * Normalize a sentence string for storage: trim, capitalize the first letter
 * (skipping any leading quote/bracket characters), and append a period when
 * the trimmed string doesn't already end with sentence-final punctuation.
 *
 * Idempotent — `normalizeSentenceText(normalizeSentenceText(s)) === normalizeSentenceText(s)`.
 */
export function normalizeSentenceText(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return trimmed;

	// Capitalize the first Unicode letter, leaving any leading non-letter
	// characters (e.g. opening quote, dash) in place.
	const capMatch = /^([^\p{L}]*)(\p{L})(.*)$/su.exec(trimmed);
	const capitalized = capMatch
		? capMatch[1] + capMatch[2].toLocaleUpperCase() + capMatch[3]
		: trimmed;

	// Treat `.`, `!`, `?`, `…` (and the three-dot ellipsis) as sentence-final
	// punctuation. Trailing closing-quote/bracket characters are also OK as long
	// as they come after one of those marks.
	const trailingPunctuation = /([.!?…]|\.\.\.)["'’”»)\]\s]*$/u;
	return trailingPunctuation.test(capitalized) ? capitalized : `${capitalized}.`;
}

export function parseWordSuggestion(formData: FormData): SuggestionParseResult<WordSuggestionInput> {
	const kalenjin = readTrimmed(formData, 'kalenjin');
	const translations = readTrimmed(formData, 'translations');
	const partOfSpeechRaw = readTrimmed(formData, 'partOfSpeech');
	const notes = readTrimmed(formData, 'notes');
	const alternativeSpellings = readTrimmed(formData, 'alternativeSpellings');
	const pluralFormRaw = readTrimmed(formData, 'pluralForm');
	const isPluralOnlyRaw = readTrimmed(formData, 'isPluralOnly');
	const isSingularOnlyRaw = readTrimmed(formData, 'isSingularOnly');
	const alternativePluralForms = readTrimmed(formData, 'alternativePluralForms');
	const presentAnee = readTrimmed(formData, 'presentAnee');
	const presentInyee = readTrimmed(formData, 'presentInyee');
	const presentInee = readTrimmed(formData, 'presentInee');
	const presentEchek = readTrimmed(formData, 'presentEchek');
	const presentOkwek = readTrimmed(formData, 'presentOkwek');
	const presentIchek = readTrimmed(formData, 'presentIchek');

	if (!kalenjin) return { ok: false, error: 'Enter a Kalenjin word or phrase.' };
	if (!translations) return { ok: false, error: 'Enter at least one English translation.' };
	if (kalenjin.length > MAX_KALENJIN_LENGTH) {
		return { ok: false, error: `Kalenjin is too long (max ${MAX_KALENJIN_LENGTH} characters).` };
	}
	if (translations.length > MAX_TRANSLATIONS_LENGTH) {
		return {
			ok: false,
			error: `Translations are too long (max ${MAX_TRANSLATIONS_LENGTH} characters).`
		};
	}
	if (notes && notes.length > MAX_NOTES_LENGTH) {
		return { ok: false, error: `Notes are too long (max ${MAX_NOTES_LENGTH} characters).` };
	}
	if (alternativeSpellings.length > MAX_ALT_SPELLINGS_LENGTH) {
		return {
			ok: false,
			error: `Alternative spellings are too long (max ${MAX_ALT_SPELLINGS_LENGTH} characters).`
		};
	}
	if (pluralFormRaw.length > MAX_PLURAL_LENGTH) {
		return {
			ok: false,
			error: `Plural form is too long (max ${MAX_PLURAL_LENGTH} characters).`
		};
	}
	if (alternativePluralForms.length > MAX_ALT_SPELLINGS_LENGTH) {
		return {
			ok: false,
			error: `Alternative plural forms are too long (max ${MAX_ALT_SPELLINGS_LENGTH} characters).`
		};
	}

	let partOfSpeech: PartOfSpeech | null = null;
	if (partOfSpeechRaw) {
		if (!isPartOfSpeech(partOfSpeechRaw)) {
			return { ok: false, error: 'Choose a valid part of speech.' };
		}
		partOfSpeech = partOfSpeechRaw;
	}

	const canHavePlural = partOfSpeech === 'NOUN' || partOfSpeech === 'ADJECTIVE';
	const isPluralOnly = canHavePlural && isPluralOnlyRaw === 'on';
	// Plural-only and singular-only are mutually exclusive; plural-only wins.
	const isSingularOnly = canHavePlural && !isPluralOnly && isSingularOnlyRaw === 'on';
	const isVerb = partOfSpeech === 'VERB';

	return {
		ok: true,
		value: {
			kalenjin,
			translations,
			partOfSpeech,
			notes: notes || null,
			alternativeSpellings: alternativeSpellings || null,
			pluralForm:
				canHavePlural && !isPluralOnly && !isSingularOnly ? pluralFormRaw || null : null,
			isPluralOnly,
			isSingularOnly,
			alternativePluralForms:
				canHavePlural && !isPluralOnly && !isSingularOnly
					? alternativePluralForms || null
					: null,
			presentAnee: isVerb ? presentAnee || null : null,
			presentInyee: isVerb ? presentInyee || null : null,
			presentInee: isVerb ? presentInee || null : null,
			presentEchek: isVerb ? presentEchek || null : null,
			presentOkwek: isVerb ? presentOkwek || null : null,
			presentIchek: isVerb ? presentIchek || null : null
		}
	};
}

export function parseSentenceSuggestion(
	formData: FormData
): SuggestionParseResult<SentenceSuggestionInput> {
	const kalenjinRaw = String(formData.get('kalenjin') ?? '').trim();
	const englishRaw = String(formData.get('english') ?? '').trim();
	const notes = String(formData.get('notes') ?? '').trim();

	if (!kalenjinRaw) return { ok: false, error: 'Enter the Kalenjin sentence.' };
	if (!englishRaw) return { ok: false, error: 'Enter the English translation.' };
	if (kalenjinRaw.length > MAX_KALENJIN_LENGTH) {
		return { ok: false, error: `Kalenjin is too long (max ${MAX_KALENJIN_LENGTH} characters).` };
	}
	if (englishRaw.length > MAX_ENGLISH_LENGTH) {
		return { ok: false, error: `English is too long (max ${MAX_ENGLISH_LENGTH} characters).` };
	}
	if (notes && notes.length > MAX_NOTES_LENGTH) {
		return { ok: false, error: `Notes are too long (max ${MAX_NOTES_LENGTH} characters).` };
	}

	return {
		ok: true,
		value: {
			kalenjin: normalizeSentenceText(kalenjinRaw),
			english: normalizeSentenceText(englishRaw),
			notes: notes || null
		}
	};
}
