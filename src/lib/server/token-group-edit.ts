import { normalizeToken } from '$lib/server/tokenize';

export type EditableToken = {
	id: string;
	tokenOrder: number;
	surfaceForm: string;
	wordId?: string | null;
	inContextTranslation?: string | null;
};

export type EditableWord<T extends EditableToken = EditableToken> = {
	token: T;
	fullSurface: string;
};

export type EditableTokenSegment = {
	segmentOrder: number;
	segmentStart: number;
	segmentEnd: number;
	surfaceForm: string;
	normalizedForm: string;
	wordId?: string | null;
};

export function orderedEditableWords<T extends EditableToken>(tokens: T[]): EditableWord<T>[] {
	return [...tokens]
		.sort((left, right) => left.tokenOrder - right.tokenOrder)
		.map((token) => ({
			token,
			fullSurface: token.surfaceForm
		}));
}

function tokenMeaning(token: EditableToken): string | null {
	return token.inContextTranslation?.trim() || null;
}

export function planMergeTokenGroups<T extends EditableToken>(
	tokens: T[],
	sourceTokenId: string,
	targetTokenId: string
) {
	const words = orderedEditableWords(tokens);
	const sourceIndex = words.findIndex((word) => word.token.id === sourceTokenId);
	const targetIndex = words.findIndex((word) => word.token.id === targetTokenId);

	if (sourceIndex === -1 || targetIndex === -1) {
		throw new Error('Choose two words from the same sentence.');
	}

	if (sourceIndex === targetIndex) {
		throw new Error('Choose two different words to combine.');
	}

	if (Math.abs(sourceIndex - targetIndex) !== 1) {
		throw new Error('Only adjacent words can be combined.');
	}

	const leftIndex = Math.min(sourceIndex, targetIndex);
	const left = words[leftIndex].token;
	const right = words[leftIndex + 1].token;
	const mergedMeaning =
		[tokenMeaning(left), tokenMeaning(right)]
			.filter((meaning): meaning is string => Boolean(meaning))
			.join(' ') || null;
	const surfaceForm = `${left.surfaceForm} ${right.surfaceForm}`;

	return {
		keepTokenId: left.id,
		removeTokenId: right.id,
		removedTokenOrder: right.tokenOrder,
		surfaceForm,
		normalizedForm: normalizeToken(surfaceForm),
		wordId: left.wordId ?? right.wordId ?? null,
		inContextTranslation: mergedMeaning
	};
}

function splitSurfaceByPoints(surface: string, splitPoints: number[]): string[] {
	const uniquePoints = [...new Set(splitPoints)].sort((a, b) => a - b);

	if (uniquePoints.length === 0) {
		throw new Error(`Choose at least one split point in "${surface}".`);
	}

	const invalidPoint = uniquePoints.find((point) => point <= 0 || point >= surface.length);
	if (invalidPoint !== undefined) {
		throw new Error(`Split points must be between 1 and ${Math.max(surface.length - 1, 1)}.`);
	}

	const boundaries = [0, ...uniquePoints, surface.length];
	return boundaries
		.slice(0, -1)
		.map((start, index) => surface.slice(start, boundaries[index + 1]))
		.filter((part) => part.length > 0);
}

export function planSplitTokenGroup<T extends EditableToken>(
	tokens: T[],
	tokenId: string,
	splitPoints?: number[]
) {
	const words = orderedEditableWords(tokens);
	const word = words.find((entry) => entry.token.id === tokenId);

	if (!word) {
		throw new Error('Word not found.');
	}

	const parts = splitPoints
		? splitSurfaceByPoints(word.token.surfaceForm, splitPoints)
		: word.token.surfaceForm
				.trim()
				.split(/\s+/)
				.filter((part) => part.length > 0);

	if (parts.length < 2) {
		throw new Error('Only words with spaces can be split.');
	}

	const meaningParts = word.token.inContextTranslation?.trim().split(/\s+/) ?? [];
	const shouldSplitMeaning = meaningParts.length === parts.length;

	return {
		tokenId: word.token.id,
		tokenOrder: word.token.tokenOrder,
		parts: parts.map((surfaceForm, index) => ({
			surfaceForm,
			normalizedForm: normalizeToken(surfaceForm),
			inContextTranslation: shouldSplitMeaning ? meaningParts[index] : index === 0 ? word.token.inContextTranslation ?? null : null
		}))
	};
}

export function planTokenLexicalSegments<T extends EditableToken>(
	tokens: T[],
	tokenId: string,
	splitPoints: number[]
): EditableTokenSegment[] {
	const token = tokens.find((entry) => entry.id === tokenId);

	if (!token) {
		throw new Error('Word not found.');
	}

	const parts = splitSurfaceByPoints(token.surfaceForm, splitPoints);
	let cursor = 0;

	return parts.map((surfaceForm, index) => {
		const segmentStart = cursor;
		const segmentEnd = segmentStart + surfaceForm.length;
		cursor = segmentEnd;

		return {
			segmentOrder: index,
			segmentStart,
			segmentEnd,
			surfaceForm,
			normalizedForm: normalizeToken(surfaceForm),
			wordId: null
		};
	});
}

export function planUpdateTokenGroupSurface<T extends EditableToken>(
	tokens: T[],
	tokenId: string,
	nextSurface: string
) {
	const word = tokens.find((token) => token.id === tokenId);

	if (!word) {
		throw new Error('Word not found.');
	}

	const trimmedSurface = nextSurface.trim();
	if (!trimmedSurface) {
		throw new Error('Word text is required.');
	}

	return {
		id: word.id,
		surfaceForm: trimmedSurface.replace(/\s+/g, ' '),
		normalizedForm: normalizeToken(trimmedSurface.replace(/\s+/g, ' '))
	};
}
