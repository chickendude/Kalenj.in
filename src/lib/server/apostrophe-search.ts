const APOSTROPHE_REGEX_SOURCE = "['\u2019\u2018`\u00b4]";
const SEARCH_APOSTROPHE = /['\u2019\u2018`\u00b4]/u;
const REGEX_SPECIAL_CHAR = /[\\^$.*+?()[\]{}|]/g;

function escapeRegex(value: string): string {
	return value.replace(REGEX_SPECIAL_CHAR, '\\$&');
}

export function hasSearchApostrophe(value: string): boolean {
	return SEARCH_APOSTROPHE.test(value);
}

export function isSearchApostrophe(value: string): boolean {
	return SEARCH_APOSTROPHE.test(value);
}

export function canInsertOptionalApostropheAfter(char: string, nextChar: string | undefined): boolean {
	return Boolean(
		nextChar &&
			!/\s/u.test(char) &&
			!/\s/u.test(nextChar) &&
			!isSearchApostrophe(char) &&
			!isSearchApostrophe(nextChar)
	);
}

export function buildApostropheOptionalRegexSource(query: string, sql = false): string {
	const whitespace = sql ? '[[:space:]]+' : '\\s+';
	const allowOptionalApostrophes = !hasSearchApostrophe(query);
	let source = '';

	for (let index = 0; index < query.length; index += 1) {
		const char = query[index];
		const nextChar = query[index + 1];

		if (/\s/u.test(char)) {
			source += whitespace;
		} else if (isSearchApostrophe(char)) {
			source += APOSTROPHE_REGEX_SOURCE;
		} else {
			source += escapeRegex(char);
		}

		if (allowOptionalApostrophes && canInsertOptionalApostropheAfter(char, nextChar)) {
			source += `${APOSTROPHE_REGEX_SOURCE}?`;
		}
	}

	return source;
}

export { APOSTROPHE_REGEX_SOURCE };
