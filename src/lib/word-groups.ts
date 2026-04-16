export type GroupableToken = {
	id: string;
	tokenOrder: number;
	surfaceForm: string;
};

export type TokenWordGroup<T extends GroupableToken> = {
	key: string;
	fullSurface: string;
	tokens: T[];
};

type GroupSentenceTokensInput<T extends GroupableToken> = {
	sentenceId?: string;
	tokens: T[];
};

export function groupSentenceTokens<T extends GroupableToken>({
	sentenceId = 'sentence',
	tokens
}: GroupSentenceTokensInput<T>): TokenWordGroup<T>[] {
	return [...tokens]
		.sort((a, b) => a.tokenOrder - b.tokenOrder)
		.map((token) => ({
			key: `${sentenceId}:${token.id}`,
			fullSurface: token.surfaceForm,
			tokens: [token]
		}));
}
