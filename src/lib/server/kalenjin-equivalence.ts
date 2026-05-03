import {
	APOSTROPHE_REGEX_SOURCE,
	canInsertOptionalApostropheAfter,
	hasSearchApostrophe,
	isSearchApostrophe
} from '$lib/server/apostrophe-search';

function isVowel(char: string | undefined): boolean {
	return char === 'a' || char === 'e' || char === 'i' || char === 'o' || char === 'u';
}

/**
 * Build a search pattern for Kalenjin letters that are commonly interchanged:
 * a/o and k/g anywhere, p/b only at word endings, si/sy/sh when followed by
 * o or e (e.g. kanetisiet ≡ kanetisyet ≡ kanetishet), and a single vowel as
 * equivalent to a doubled one (e.g. keer ≡ ker, siir ≡ sir).
 */
export function buildEquivalentSearchRegexSource(query: string, sql = false): string {
	const whitespace = sql ? '[[:space:]]+' : '\\s+';
	const allowOptionalApostrophes = !hasSearchApostrophe(query);
	let source = '';

	for (let index = 0; index < query.length; index += 1) {
		const char = query[index];
		const nextChar = query[index + 1];
		const charAfterNext = query[index + 2];
		const isWordFinal = !nextChar || /\s/.test(nextChar);
		const isSiSySh =
			char === 's' &&
			(nextChar === 'i' || nextChar === 'y' || nextChar === 'h') &&
			(charAfterNext === 'o' || charAfterNext === 'e');

		if (isSiSySh) {
			source += '(?:si|sy|sh)';
			if (allowOptionalApostrophes && canInsertOptionalApostropheAfter(nextChar, charAfterNext)) {
				source += `${APOSTROPHE_REGEX_SOURCE}?`;
			}
			index += 1;
			continue;
		}

		if (isVowel(char)) {
			let runLength = 1;
			while (query[index + runLength] === char) {
				runLength += 1;
			}
			const vowelClass = char === 'a' || char === 'o' ? '[ao]' : char;
			source += `${vowelClass}{1,${Math.max(runLength, 2)}}`;
			const charAfterRun = query[index + runLength];
			if (allowOptionalApostrophes && canInsertOptionalApostropheAfter(char, charAfterRun)) {
				source += `${APOSTROPHE_REGEX_SOURCE}?`;
			}
			index += runLength - 1;
			continue;
		}

		if (/\s/.test(char)) {
			source += whitespace;
		} else if (isSearchApostrophe(char)) {
			source += APOSTROPHE_REGEX_SOURCE;
		} else if (char === 'k' || char === 'g') {
			source += '[kg]';
		} else if ((char === 'p' || char === 'b') && isWordFinal) {
			source += sql ? (nextChar ? '[pb]' : '[pb]($|[[:space:]])') : '[pb](?=$|\\s)';
		} else {
			source += char.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
		}

		if (allowOptionalApostrophes && canInsertOptionalApostropheAfter(char, nextChar)) {
			source += `${APOSTROPHE_REGEX_SOURCE}?`;
		}
	}

	return source;
}

export function buildEquivalentSqlSearchPattern(query: string): string {
	return buildEquivalentSearchRegexSource(query, true);
}

export function matchesEquivalentSearch(
	form: string,
	query: string,
	mode: 'exact' | 'prefix' | 'contains'
): boolean {
	const source = buildEquivalentSearchRegexSource(query);
	const pattern = mode === 'exact' ? `^${source}$` : mode === 'prefix' ? `^${source}` : source;

	return new RegExp(pattern).test(form);
}
