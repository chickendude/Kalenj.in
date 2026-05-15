export type GroupableToken = {
	id: string;
	tokenOrder: number;
	surfaceForm: string;
};

export type TokenWordGroup<T extends GroupableToken> = {
	key: string;
	fullSurface: string;
	tokens: T[];
	// Start this group's word on a new visual line (a new speaker turn).
	breakBefore: boolean;
	// First word of a speaker turn in a multi-turn sentence — gets a leading
	// dialogue dash marker.
	speakerTurn: boolean;
};

const SPEAKER_SEPARATOR = '-';

// Whitespace-split indexes of standalone "-" chunks, used in the corpus to mark
// a change of speaker (e.g. a question vs. its answer). tokenizeSentence drops
// these chunks but assigns tokenOrder from the pre-filter split index, so each
// separator's index lands in the gap between the surrounding tokens' tokenOrder
// values. The trim + /\s+/ split here must mirror tokenizeSentence so the
// indexes stay aligned with the persisted tokenOrder.
function speakerBreakOrders(sentenceText: string): number[] {
	const trimmed = sentenceText.trim();
	if (!trimmed) {
		return [];
	}

	const orders: number[] = [];
	trimmed.split(/\s+/).forEach((chunk, index) => {
		if (chunk === SPEAKER_SEPARATOR) {
			orders.push(index);
		}
	});
	return orders;
}

type GroupSentenceTokensInput<T extends GroupableToken> = {
	sentenceId?: string;
	tokens: T[];
	sentenceText?: string;
};

export function groupSentenceTokens<T extends GroupableToken>({
	sentenceId = 'sentence',
	tokens,
	sentenceText
}: GroupSentenceTokensInput<T>): TokenWordGroup<T>[] {
	const breakOrders = sentenceText ? speakerBreakOrders(sentenceText) : [];
	const hasSpeakerTurns = breakOrders.length > 0;
	const sorted = [...tokens].sort((a, b) => a.tokenOrder - b.tokenOrder);

	let previousOrder = -1;
	return sorted.map((token, index) => {
		const breakBefore =
			index > 0 &&
			breakOrders.some((order) => order > previousOrder && order < token.tokenOrder);
		previousOrder = token.tokenOrder;
		return {
			key: `${sentenceId}:${token.id}`,
			fullSurface: token.surfaceForm,
			tokens: [token],
			breakBefore,
			speakerTurn: hasSpeakerTurns && (breakBefore || index === 0)
		};
	});
}
