import { describe, expect, it, vi } from 'vitest';
import { buildWordSelect, createOrUpdateLinkedWord, readPresentTenseFromFormData } from './lemma-words';

describe('buildWordSelect', () => {
	it('selects the core word columns plus ordered spellings', () => {
		const select = buildWordSelect();

		expect(select).toMatchObject({
			id: true,
			kalenjin: true,
			slug: true,
			translations: true,
			partOfSpeech: true,
			pluralForm: true,
			isPluralOnly: true,
			isSwahiliLoan: true,
			imageUrl: true
		});
		// all six present-tense columns
		for (const key of [
			'presentAnee',
			'presentInyee',
			'presentInee',
			'presentEchek',
			'presentOkwek',
			'presentIchek'
		]) {
			expect(select[key as keyof typeof select]).toBe(true);
		}
		expect(select.spellings.orderBy).toEqual([{ spelling: 'asc' }]);
		expect(select.spellings.select).toMatchObject({ id: true, spelling: true });
	});
});

describe('createOrUpdateLinkedWord', () => {
	it('stores the Swahili loan flag on create', async () => {
		const create = vi.fn().mockResolvedValue({ id: 'word-1' });
		const findMany = vi.fn().mockResolvedValue([]);
		const tx = { $executeRaw: vi.fn(), word: { create, findMany } };

		await createOrUpdateLinkedWord(tx as never, {
			kalenjin: 'meza',
			translations: 'table',
			isSwahiliLoan: true
		});

		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ isSwahiliLoan: true })
			})
		);
	});

	it('clears the Swahili loan flag when updating without it checked', async () => {
		const update = vi.fn().mockResolvedValue({ id: 'word-1' });
		const findUnique = vi.fn().mockResolvedValue({ kalenjin: 'meza', slug: 'meza' });
		const tx = {
			$executeRaw: vi.fn(),
			word: { findUnique, update, findMany: vi.fn().mockResolvedValue([]) }
		};

		await createOrUpdateLinkedWord(tx as never, {
			wordId: 'word-1',
			kalenjin: 'meza',
			translations: 'table',
			isSwahiliLoan: false
		});

		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ isSwahiliLoan: false })
			})
		);
	});

	it('leaves the Swahili loan flag untouched on update when omitted', async () => {
		const update = vi.fn().mockResolvedValue({ id: 'word-1' });
		const findUnique = vi.fn().mockResolvedValue({ kalenjin: 'meza', slug: 'meza' });
		const tx = {
			$executeRaw: vi.fn(),
			word: { findUnique, update, findMany: vi.fn().mockResolvedValue([]) }
		};

		await createOrUpdateLinkedWord(tx as never, {
			wordId: 'word-1',
			kalenjin: 'meza',
			translations: 'table'
		});

		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.not.objectContaining({ isSwahiliLoan: expect.any(Boolean) })
			})
		);
	});

	it('keeps the current slug when updating a word without renaming it', async () => {
		const update = vi.fn().mockResolvedValue({ id: 'word-1' });
		const findUnique = vi.fn().mockResolvedValue({ kalenjin: 'kot', slug: 'kot-2' });
		const findMany = vi.fn().mockResolvedValue([]);
		const tx = { $executeRaw: vi.fn(), word: { findUnique, update, findMany } };

		await createOrUpdateLinkedWord(tx as never, {
			wordId: 'word-1',
			kalenjin: 'kot',
			translations: 'changed'
		});

		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.not.objectContaining({ slug: expect.any(String) })
			})
		);
		expect(findMany).not.toHaveBeenCalled();
	});

	it('updates the slug when updating a renamed word', async () => {
		const update = vi.fn().mockResolvedValue({ id: 'word-1' });
		const findUnique = vi.fn().mockResolvedValue({ kalenjin: 'old', slug: 'old' });
		const tx = {
			$executeRaw: vi.fn(),
			word: { findUnique, update, findMany: vi.fn().mockResolvedValue([]) }
		};

		await createOrUpdateLinkedWord(tx as never, {
			wordId: 'word-1',
			kalenjin: 'renamed',
			translations: 'changed'
		});

		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ slug: 'renamed' })
			})
		);
	});
});

describe('readPresentTenseFromFormData', () => {
	function fd(entries: Record<string, string>): FormData {
		const f = new FormData();
		for (const [k, v] of Object.entries(entries)) f.set(k, v);
		return f;
	}

	it('reads all six conjugations, trimming whitespace', () => {
		const result = readPresentTenseFromFormData(
			fd({
				presentAnee: '  achobe ',
				presentInyee: 'ichobe',
				presentInee: 'kochobe',
				presentEchek: 'kichobe',
				presentOkwek: 'ochobe',
				presentIchek: 'chochobe'
			})
		);

		expect(result).toEqual({
			presentAnee: 'achobe',
			presentInyee: 'ichobe',
			presentInee: 'kochobe',
			presentEchek: 'kichobe',
			presentOkwek: 'ochobe',
			presentIchek: 'chochobe'
		});
	});

	it('maps missing or blank fields to null', () => {
		const result = readPresentTenseFromFormData(fd({ presentAnee: '   ' }));

		expect(result).toEqual({
			presentAnee: null,
			presentInyee: null,
			presentInee: null,
			presentEchek: null,
			presentOkwek: null,
			presentIchek: null
		});
	});
});
