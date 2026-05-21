import { describe, expect, it } from 'vitest';
import { buildWordSelect, readPresentTenseFromFormData } from './lemma-words';

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
