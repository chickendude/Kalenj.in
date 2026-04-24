import { describe, expect, it } from 'vitest';
import { combinePluralFormVariants, splitPluralFormVariants } from './plural-form-variants';

describe('splitPluralFormVariants', () => {
	it('splits the first plural form from alternate plural forms', () => {
		expect(splitPluralFormVariants('chego, chegok, chegu')).toEqual({
			pluralForm: 'chego',
			alternativePluralForms: 'chegok, chegu'
		});
	});

	it('returns empty values when no plural forms are present', () => {
		expect(splitPluralFormVariants(null)).toEqual({
			pluralForm: '',
			alternativePluralForms: ''
		});
	});
});

describe('combinePluralFormVariants', () => {
	it('combines the primary and alternate plural inputs into one list', () => {
		expect(combinePluralFormVariants('chego', 'chegok, chegu')).toBe('chego, chegok, chegu');
	});

	it('omits empty inputs', () => {
		expect(combinePluralFormVariants('', 'chegok')).toBe('chegok');
		expect(combinePluralFormVariants('chego', '')).toBe('chego');
	});
});
