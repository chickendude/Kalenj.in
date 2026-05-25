import { describe, expect, it, vi } from 'vitest';
import { buildWordSelect, createOrUpdateLinkedWord, readPresentTenseFromFormData } from './lemma-words';

describe('buildWordSelect', () => {
	it('selects the core word columns plus ordered spellings', () => {
		const select = buildWordSelect();

		expect(select).toMatchObject({
			id: true,
			kalenjin: true,
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
		const tx = { word: { create } };

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
		const tx = { word: { update } };

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
		const tx = { word: { update } };

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
