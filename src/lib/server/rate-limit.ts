// Tiny in-memory sliding-window rate limiter, scoped per (key, bucket).
// Keys are arbitrary strings (we use them for IPs and user ids). For the
// single-node SvelteKit deploy this is enough; if we ever scale horizontally
// this needs to move to Redis or another shared store.
//
// Each call to `consumeRateLimit` records "now" against the key and prunes
// timestamps older than `windowMs`. If the resulting count exceeds `max`,
// it's a denial — the caller gets back the time until the oldest hit ages
// out, so it can hint to the client.

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

// Cap on total tracked keys so a flood of unique IPs can't grow this map
// without bound. When we hit the cap, the oldest bucket is evicted.
const MAX_KEYS = 5_000;

function evictOldestIfFull() {
	if (buckets.size < MAX_KEYS) return;
	const firstKey = buckets.keys().next().value;
	if (firstKey !== undefined) buckets.delete(firstKey);
}

export type RateLimitResult = {
	allowed: boolean;
	remaining: number;
	retryAfterMs: number;
};

export function consumeRateLimit(
	key: string,
	max: number,
	windowMs: number,
	now: number = Date.now()
): RateLimitResult {
	const cutoff = now - windowMs;
	let bucket = buckets.get(key);
	if (!bucket) {
		bucket = { timestamps: [] };
		evictOldestIfFull();
		buckets.set(key, bucket);
	}

	// Drop anything outside the window.
	while (bucket.timestamps.length > 0 && bucket.timestamps[0] <= cutoff) {
		bucket.timestamps.shift();
	}

	if (bucket.timestamps.length >= max) {
		const retryAfterMs = Math.max(0, bucket.timestamps[0] + windowMs - now);
		return { allowed: false, remaining: 0, retryAfterMs };
	}

	bucket.timestamps.push(now);
	return {
		allowed: true,
		remaining: max - bucket.timestamps.length,
		retryAfterMs: 0
	};
}

// Test-only helper: clear the in-memory state between cases.
export function _resetRateLimitForTests() {
	buckets.clear();
}
