export type GroupableToken = {
	id: string;
	tokenOrder: number;
	surfaceForm: string;
};

export type TokenWordGroup<T extends GroupableToken> = {
	key: string;
	wordIndex: number;
	fullSurface: string;
	tokens: T[];
};

type GroupSentenceTokensInput<T extends GroupableToken> = {
	sentenceId?: string;
	sentenceText: string;
	tokens: T[];
};

export function groupSentenceTokens<T extends GroupableToken>({
	sentenceId = 'sentence',
	sentenceText,
	tokens
}: GroupSentenceTokensInput<T>): TokenWordGroup<T>[] {
	const sorted = [...tokens].sort((a, b) => a.tokenOrder - b.tokenOrder);
	const words = sentenceText
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0);
	const groups: TokenWordGroup<T>[] = [];
	let tokenCursor = 0;

	for (let wordIndex = 0; wordIndex < words.length && tokenCursor < sorted.length; wordIndex += 1) {
		const wordSurface = words[wordIndex];
		const grouped: T[] = [];
		let combined = '';

		while (tokenCursor < sorted.length && combined.length < wordSurface.length) {
			const token = sorted[tokenCursor];
			grouped.push(token);
			combined += token.surfaceForm;
			tokenCursor += 1;
		}

		if (grouped.length === 0) {
			continue;
		}

		groups.push({
			key: `${sentenceId}:${wordIndex}:${grouped.map((token) => token.id).join(':')}`,
			wordIndex,
			fullSurface: wordSurface,
			tokens: grouped
		});
	}

	while (tokenCursor < sorted.length) {
		const token = sorted[tokenCursor];
		const wordIndex = groups.length;
		groups.push({
			key: `${sentenceId}:${wordIndex}:${token.id}`,
			wordIndex,
			fullSurface: token.surfaceForm,
			tokens: [token]
		});
		tokenCursor += 1;
	}

	if (groups.length === 0) {
		return sorted.map((token, wordIndex) => ({
			key: `${sentenceId}:${wordIndex}:${token.id}`,
			wordIndex,
			fullSurface: token.surfaceForm,
			tokens: [token]
		}));
	}

	return groups;
}
