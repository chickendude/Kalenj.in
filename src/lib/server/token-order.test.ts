import { describe, expect, it } from 'vitest';
import { assignSequentialTokenOrders, temporaryTokenOrderUpdates } from './token-order';

describe('assignSequentialTokenOrders', () => {
	it('assigns zero-based token orders without changing the token payload', () => {
		expect(assignSequentialTokenOrders([{ id: 'a' }, { id: 'b' }])).toEqual([
			{ id: 'a', tokenOrder: 0 },
			{ id: 'b', tokenOrder: 1 }
		]);
	});
});

describe('temporaryTokenOrderUpdates', () => {
	it('moves tokens below the existing minimum order to avoid unique collisions', () => {
		expect(
			temporaryTokenOrderUpdates([
				{ id: 'b', tokenOrder: 10_001 },
				{ id: 'a', tokenOrder: 10_000 }
			])
		).toEqual([
			{ id: 'a', tokenOrder: -2 },
			{ id: 'b', tokenOrder: -3 }
		]);
	});

	it('stays below existing negative token orders', () => {
		expect(
			temporaryTokenOrderUpdates([
				{ id: 'a', tokenOrder: -3 },
				{ id: 'b', tokenOrder: -1 }
			])
		).toEqual([
			{ id: 'a', tokenOrder: -5 },
			{ id: 'b', tokenOrder: -6 }
		]);
	});
});
