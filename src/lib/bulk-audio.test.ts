import { describe, expect, it } from 'vitest';
import { fmtSecMs, hashId, seededWaveform } from './bulk-audio';

describe('hashId', () => {
	it('is deterministic for the same id', () => {
		expect(hashId('token-1')).toBe(hashId('token-1'));
	});

	it('differs for different ids', () => {
		expect(hashId('token-1')).not.toBe(hashId('token-2'));
	});

	it('always returns a positive non-zero integer', () => {
		for (const id of ['', 'a', 'a-very-long-identifier-string', '🙂']) {
			const h = hashId(id);
			expect(h).toBeGreaterThanOrEqual(1);
			expect(Number.isInteger(h)).toBe(true);
		}
	});
});

describe('seededWaveform', () => {
	it('returns the requested number of bars', () => {
		expect(seededWaveform(123, 24, 1)).toHaveLength(24);
	});

	it('is deterministic for the same seed/len/length', () => {
		expect(seededWaveform(7, 16, 2)).toEqual(seededWaveform(7, 16, 2));
	});

	it('keeps every bar within (0, 1]', () => {
		for (const bar of seededWaveform(42, 40, 3)) {
			expect(bar).toBeGreaterThan(0);
			expect(bar).toBeLessThanOrEqual(1);
		}
	});

	it('scales amplitude down for very short clips', () => {
		const short = seededWaveform(5, 32, 0);
		const long = seededWaveform(5, 32, 5);
		const max = (xs: number[]) => Math.max(...xs);
		expect(max(short)).toBeLessThan(max(long));
	});
});

describe('fmtSecMs', () => {
	it('formats seconds as 0:SS.cs', () => {
		expect(fmtSecMs(0)).toBe('0:00.00');
		expect(fmtSecMs(3.5)).toBe('0:03.50');
		expect(fmtSecMs(12.34)).toBe('0:12.34');
	});

	it('rounds centiseconds (half up)', () => {
		// 0.125 is exactly representable; 12.5 centiseconds rounds to 13.
		expect(fmtSecMs(5.125)).toBe('0:05.13');
	});
});
