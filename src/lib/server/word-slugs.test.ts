import { describe, expect, it, vi } from 'vitest';
import { generateUniqueWordSlug } from './word-slugs';

describe('generateUniqueWordSlug', () => {
	it('serializes slug generation for the same base slug', async () => {
		const executeRaw = vi.fn().mockResolvedValue(1);
		const findMany = vi.fn().mockResolvedValue([]);

		await generateUniqueWordSlug({ $executeRaw: executeRaw, word: { findMany } } as never, 'kot');

		expect(executeRaw).toHaveBeenCalledTimes(1);
		expect(findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					OR: [{ slug: 'kot' }, { slug: { startsWith: 'kot-' } }]
				})
			})
		);
	});

	it('ignores unrelated slugs that merely share the same prefix', async () => {
		const executeRaw = vi.fn().mockResolvedValue(1);
		const findMany = vi.fn().mockResolvedValue([
			{ slug: 'kot' },
			{ slug: 'kot-house' },
			{ slug: 'kot-1' }
		]);

		await expect(
			generateUniqueWordSlug({ $executeRaw: executeRaw, word: { findMany } } as never, 'kot')
		).resolves.toBe('kot-2');
	});
});
