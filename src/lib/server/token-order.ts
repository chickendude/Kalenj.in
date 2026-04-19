export type OrderedToken = {
	id: string;
	tokenOrder: number;
};

export function assignSequentialTokenOrders<T>(tokens: T[]): Array<T & { tokenOrder: number }> {
	return tokens.map((token, tokenOrder) => ({
		...token,
		tokenOrder
	}));
}

export function temporaryTokenOrderUpdates<T extends OrderedToken>(tokens: T[]): OrderedToken[] {
	const sorted = [...tokens].sort((left, right) => left.tokenOrder - right.tokenOrder);
	const minOrder = sorted.reduce(
		(currentMin, token) => Math.min(currentMin, token.tokenOrder),
		0
	);
	const firstTemporaryOrder = Math.min(-1, minOrder - sorted.length);

	return sorted.map((token, index) => ({
		id: token.id,
		tokenOrder: firstTemporaryOrder - index
	}));
}
