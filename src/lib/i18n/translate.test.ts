import { describe, expect, it } from 'vitest';
import { parseLocale } from './locale';
import { translate, translateWithSlot } from './translate';
import { en } from './messages/en';
import { kln } from './messages/kln';

describe('parseLocale', () => {
	it('accepts supported locales', () => {
		expect(parseLocale('en')).toBe('en');
		expect(parseLocale('kln')).toBe('kln');
	});

	it('rejects unknown or missing values', () => {
		expect(parseLocale('fr')).toBeNull();
		expect(parseLocale('')).toBeNull();
		expect(parseLocale(null)).toBeNull();
		expect(parseLocale(undefined)).toBeNull();
	});
});

describe('translate', () => {
	it('returns English messages for the en locale', () => {
		expect(translate('en', 'nav.dictionary')).toBe('Dictionary');
	});

	it('returns Kalenjin catalog entries for the kln locale', () => {
		expect(translate('kln', 'nav.dictionary')).toBe(kln['nav.dictionary']);
	});

	it('falls back to English for keys missing from the kln catalog', () => {
		expect(kln['menu.signOut']).toBeUndefined();
		expect(translate('kln', 'menu.signOut')).toBe(en['menu.signOut']);
	});

	it('interpolates placeholders', () => {
		expect(translate('en', 'search.noMatches', { query: 'lakwa' })).toBe(
			'No entries match “lakwa”.'
		);
	});

	it('leaves unknown placeholders untouched', () => {
		expect(translate('en', 'search.noMatches', { other: 'x' })).toBe(
			'No entries match “{query}”.'
		);
	});

	it('only contains kln keys that exist in the en catalog', () => {
		for (const key of Object.keys(kln)) {
			expect(key in en, `unknown key in kln catalog: ${key}`).toBe(true);
		}
	});
});

describe('translateWithSlot', () => {
	it('splits a sentence around a mid-sentence slot', () => {
		expect(translateWithSlot('en', 'footer.lede', 'term')).toEqual([
			'Kalenj.in is a project to document and record the ',
			' — the language of sweetness — and provide resources for natives, heritage speakers, and learners of the Kalenjin language.'
		]);
	});

	it('splits around a trailing slot', () => {
		expect(translateWithSlot('en', 'home.noExampleYet', 'link')).toEqual([
			'No example yet — ',
			'.'
		]);
	});

	it('returns a single part when the translation omits the slot', () => {
		// nav.dictionary has no {term}; callers render no slot content then.
		expect(translateWithSlot('en', 'nav.dictionary', 'term')).toEqual(['Dictionary']);
	});

	it('still interpolates other params', () => {
		const parts = translateWithSlot('en', 'search.noMatches', 'nope', { query: 'teta' });
		expect(parts).toEqual(['No entries match “teta”.']);
	});
});
