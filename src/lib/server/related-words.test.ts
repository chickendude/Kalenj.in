import { describe, expect, it } from 'vitest';
import { relatedWordPair } from './related-words';

describe('relatedWordPair', () => {
	it('orders the smaller id first', () => {
		expect(relatedWordPair('z-word', 'a-word')).toEqual({
			wordId: 'a-word',
			relatedWordId: 'z-word'
		});
	});

	it('keeps the order when the first id is already smaller', () => {
		expect(relatedWordPair('aaa', 'bbb')).toEqual({
			wordId: 'aaa',
			relatedWordId: 'bbb'
		});
	});

	it('produces the same canonical pair regardless of input order', () => {
		const a = relatedWordPair('one', 'two');
		const b = relatedWordPair('two', 'one');
		expect(a).toEqual(b);
	});

	it('handles identical ids by keeping both fields the same', () => {
		expect(relatedWordPair('self', 'self')).toEqual({
			wordId: 'self',
			relatedWordId: 'self'
		});
	});
});
