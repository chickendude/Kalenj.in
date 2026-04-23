export type SentencePair = {
	kalenjin: string;
	english: string;
};

const SENTENCE_TERMINATOR = /([.?!])\s+(?=\S)/g;

export function splitSentenceText(text: string): string[] {
	const trimmed = text.trim();
	if (!trimmed) {
		return [];
	}

	const pieces: string[] = [];
	let lastIndex = 0;
	SENTENCE_TERMINATOR.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = SENTENCE_TERMINATOR.exec(trimmed)) !== null) {
		const end = match.index + match[1].length;
		const piece = trimmed.slice(lastIndex, end).trim();
		if (piece.length > 0) {
			pieces.push(piece);
		}
		lastIndex = end + (match[0].length - match[1].length);
	}

	const tail = trimmed.slice(lastIndex).trim();
	if (tail.length > 0) {
		pieces.push(tail);
	}

	return pieces.length > 0 ? pieces : [trimmed];
}

export function splitIntoSentences(kalenjin: string, english: string): SentencePair[] {
	const kalenjinPieces = splitSentenceText(kalenjin);

	if (kalenjinPieces.length <= 1) {
		return [{ kalenjin: kalenjin.trim(), english: english.trim() }];
	}

	const englishPieces = splitSentenceText(english);

	if (englishPieces.length === kalenjinPieces.length) {
		return kalenjinPieces.map((k, i) => ({
			kalenjin: k,
			english: englishPieces[i]
		}));
	}

	return kalenjinPieces.map((k, i) => ({
		kalenjin: k,
		english: i === 0 ? english.trim() : ''
	}));
}
