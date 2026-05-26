import { describe, expect, it } from 'vitest';
import { normalizeSentenceText } from './suggestions';

describe('normalizeSentenceText', () => {
	it('capitalizes the first letter and adds a period when there is no terminal punctuation', () => {
		expect(normalizeSentenceText('hello world')).toBe('Hello world.');
	});

	it('leaves an already-capitalized sentence with a period alone', () => {
		expect(normalizeSentenceText('Hello world.')).toBe('Hello world.');
	});

	it('keeps existing terminal punctuation (?, !, …)', () => {
		expect(normalizeSentenceText('what is your name?')).toBe('What is your name?');
		expect(normalizeSentenceText('wow!')).toBe('Wow!');
		expect(normalizeSentenceText('and so on…')).toBe('And so on…');
	});

	it('treats the three-dot ellipsis (...) as terminal punctuation', () => {
		expect(normalizeSentenceText('etc...')).toBe('Etc...');
	});

	it('trims leading and trailing whitespace before normalizing', () => {
		expect(normalizeSentenceText('   sasa  ')).toBe('Sasa.');
	});

	it('skips leading quote/bracket characters when capitalizing', () => {
		expect(normalizeSentenceText('"sasa"')).toBe('"Sasa".');
		expect(normalizeSentenceText('“habari” yako')).toBe('“Habari” yako.');
	});

	it('keeps a sentence ending with a closing quote after punctuation', () => {
		expect(normalizeSentenceText('"hello!"')).toBe('"Hello!"');
	});

	it('returns the empty string for empty input', () => {
		expect(normalizeSentenceText('')).toBe('');
		expect(normalizeSentenceText('   ')).toBe('');
	});

	it('is idempotent', () => {
		const once = normalizeSentenceText('kongoi missing');
		expect(normalizeSentenceText(once)).toBe(once);
	});

	it('leaves non-letter starting characters alone (numbers stay as digits)', () => {
		expect(normalizeSentenceText('123 sheep')).toBe('123 Sheep.');
	});
});
