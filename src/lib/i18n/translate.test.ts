import { describe, expect, it } from 'vitest';
import { parseLocale } from './locale';
import { translate } from './translate';
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

	it('returns Kalenjin overrides for the kln locale', () => {
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

	it('prefers runtime overrides over the static catalogs', () => {
		expect(translate('kln', 'nav.dictionary', undefined, { 'nav.dictionary': 'Edited' })).toBe(
			'Edited'
		);
		expect(translate('kln', 'menu.signOut', undefined, { 'menu.signOut': 'Mang’u' })).toBe(
			'Mang’u'
		);
	});

	it('falls through overrides for keys they do not cover', () => {
		expect(translate('kln', 'nav.dictionary', undefined, { 'menu.signOut': 'x' })).toBe(
			kln['nav.dictionary']
		);
	});

	it('interpolates params in overridden templates', () => {
		expect(
			translate('kln', 'search.noMatches', { query: 'teta' }, { 'search.noMatches': 'Mamiten “{query}”.' })
		).toBe('Mamiten “teta”.');
	});

	it('only contains kln keys that exist in the en catalog', () => {
		for (const key of Object.keys(kln)) {
			expect(key in en, `unknown key in kln catalog: ${key}`).toBe(true);
		}
	});
});
