import { beforeEach, describe, expect, it } from 'vitest';
import { _resetRateLimitForTests, consumeRateLimit } from './rate-limit';

beforeEach(() => {
	_resetRateLimitForTests();
});

describe('consumeRateLimit', () => {
	it('allows the first call through', () => {
		const result = consumeRateLimit('k', 3, 1000, 0);
		expect(result).toMatchObject({ allowed: true, remaining: 2, retryAfterMs: 0 });
	});

	it('allows up to `max` calls within the window', () => {
		const results = [
			consumeRateLimit('k', 3, 1000, 0),
			consumeRateLimit('k', 3, 1000, 100),
			consumeRateLimit('k', 3, 1000, 200)
		];
		expect(results.every((r) => r.allowed)).toBe(true);
		expect(results.map((r) => r.remaining)).toEqual([2, 1, 0]);
	});

	it('blocks the (max + 1)th call and reports a retry-after based on the oldest hit', () => {
		consumeRateLimit('k', 2, 1000, 0);
		consumeRateLimit('k', 2, 1000, 200);

		const blocked = consumeRateLimit('k', 2, 1000, 300);

		expect(blocked.allowed).toBe(false);
		expect(blocked.remaining).toBe(0);
		// Oldest timestamp is 0, window is 1000, now is 300 → retry in 700ms.
		expect(blocked.retryAfterMs).toBe(700);
	});

	it('allows traffic again once the oldest hit ages out of the window', () => {
		consumeRateLimit('k', 2, 1000, 0);
		consumeRateLimit('k', 2, 1000, 500);

		// At t=1001 the first hit has aged out; bucket has 1 hit (at 500) so we
		// should be back under the limit.
		const result = consumeRateLimit('k', 2, 1000, 1001);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(0);
	});

	it('isolates buckets per key', () => {
		consumeRateLimit('a', 1, 1000, 0);
		const second = consumeRateLimit('b', 1, 1000, 0);
		expect(second.allowed).toBe(true);
		const blocked = consumeRateLimit('a', 1, 1000, 100);
		expect(blocked.allowed).toBe(false);
	});

	it('never returns negative retryAfterMs even if the clock jitters', () => {
		consumeRateLimit('k', 1, 1000, 1000);
		const result = consumeRateLimit('k', 1, 1000, 500); // clock moved backwards
		expect(result.allowed).toBe(false);
		expect(result.retryAfterMs).toBeGreaterThanOrEqual(0);
	});
});
