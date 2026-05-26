import { describe, expect, it, vi } from 'vitest';
import { propagateKalenjinRename } from './propagate-rename';

type WordRow = { id: string; notes: string | null; translations: string };

function mockClient(rows: WordRow[]) {
	const findUnique = vi.fn().mockResolvedValue({ id: 'cuid-1', kalenjin: 'new name', slug: 'new-name' });
	const findMany = vi.fn().mockResolvedValue(rows);
	const update = vi.fn().mockResolvedValue({});
	return {
		client: { word: { findUnique, findMany, update } } as never,
		findUnique,
		findMany,
		update
	};
}

describe('propagateKalenjinRename', () => {
	it('rewrites link labels in both notes and translations for matching rows', async () => {
		const { client, update } = mockClient([
			{
				id: 'word-a',
				notes: 'See [old name](/dictionary/cuid-1) for context.',
				translations: 'related to [old name](/dictionary/cuid-1)'
			}
		]);

		await propagateKalenjinRename(client, 'cuid-1', 'new name');

		expect(update).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledWith({
			where: { id: 'word-a' },
			data: {
				notes: 'See [new name](/dictionary/new-name) for context.',
				translations: 'related to [new name](/dictionary/new-name)'
			}
		});
	});

	it('skips updates when neither notes nor translations actually change', async () => {
		const { client, update } = mockClient([
			{
				id: 'word-a',
				notes: 'See [unrelated](/dictionary/other-cuid)',
				translations: 'plain translation text'
			}
		]);

		await propagateKalenjinRename(client, 'cuid-1', 'new name');

		expect(update).not.toHaveBeenCalled();
	});

	it('handles rows with null notes', async () => {
		const { client, update } = mockClient([
			{
				id: 'word-a',
				notes: null,
				translations: 'see [old](/dictionary/cuid-1)'
			}
		]);

		await propagateKalenjinRename(client, 'cuid-1', 'new');

		expect(update).toHaveBeenCalledWith({
			where: { id: 'word-a' },
			data: {
				notes: null,
				translations: 'see [new](/dictionary/new-name)'
			}
		});
	});

	it('queries the correct shape with both contains predicates', async () => {
		const { client, findMany } = mockClient([]);

		await propagateKalenjinRename(client, 'cuid-1', 'x');

		expect(findMany).toHaveBeenCalledWith({
			where: {
				OR: [
					{ notes: { contains: 'cuid-1)' } },
					{ translations: { contains: 'cuid-1)' } }
				]
			},
			select: { id: true, notes: true, translations: true }
		});
	});

	it('is a no-op when no rows match the link', async () => {
		const { client, update } = mockClient([]);

		await propagateKalenjinRename(client, 'cuid-1', 'new');

		expect(update).not.toHaveBeenCalled();
	});
});
