type WordLinkTarget = {
	id?: string;
	kalenjin: string;
	slug?: string;
};

export function slugifyWordName(kalenjin: string): string {
	const slug = kalenjin
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');

	return slug || 'word';
}

export function dictionaryEntrySegment(word: WordLinkTarget): string {
	if (word.slug) return word.slug;
	return slugifyWordName(word.kalenjin);
}

export function dictionaryEntryHref(word: WordLinkTarget): string {
	return `/dictionary/${encodeURIComponent(dictionaryEntrySegment(word))}`;
}

export function decodeDictionarySegment(segment: string): string {
	return decodeURIComponent(segment).trim().toLowerCase();
}
