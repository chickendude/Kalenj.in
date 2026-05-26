import { describe, expect, it } from 'vitest';
import {
	buildWordLinkInsertion,
	renderWordLinks,
	rewriteLinkLabel,
	stripWordLinks
} from './word-links';

describe('renderWordLinks', () => {
	it('returns empty string for null or undefined', () => {
		expect(renderWordLinks(null)).toBe('');
		expect(renderWordLinks(undefined)).toBe('');
		expect(renderWordLinks('')).toBe('');
	});

	it('passes plain text through with HTML escaping', () => {
		expect(renderWordLinks('hello <world>')).toBe('hello &lt;world&gt;');
	});

	it('renders a single link as an anchor with same-tab navigation', () => {
		expect(renderWordLinks('see [chamgei](/dictionary/abc123)')).toBe(
			'see <a href="/dictionary/abc123">chamgei</a>'
		);
	});

	it('renders readable word slugs', () => {
		expect(renderWordLinks('see [chamgei](/dictionary/chamgei)')).toBe(
			'see <a href="/dictionary/chamgei">chamgei</a>'
		);
	});

	it('renders multiple links in one string', () => {
		expect(
			renderWordLinks('[a](/dictionary/x1); and [b](/dictionary/y2) too')
		).toBe('<a href="/dictionary/x1">a</a>; and <a href="/dictionary/y2">b</a> too');
	});

	it('escapes HTML inside labels', () => {
		expect(renderWordLinks('[<img onerror=alert(1)>](/dictionary/abc)')).toBe(
			'<a href="/dictionary/abc">&lt;img onerror=alert(1)&gt;</a>'
		);
	});

	it('escapes HTML in surrounding text', () => {
		expect(renderWordLinks('<b>[x](/dictionary/abc)</b>')).toBe(
			'&lt;b&gt;<a href="/dictionary/abc">x</a>&lt;/b&gt;'
		);
	});

	it('handles a trailing link after text', () => {
		expect(renderWordLinks('see also [c](/dictionary/xyz) d')).toBe(
			'see also <a href="/dictionary/xyz">c</a> d'
		);
	});

	it('does not match non-dictionary URLs', () => {
		expect(renderWordLinks('[x](/other/abc)')).toBe('[x](/other/abc)');
		expect(renderWordLinks('[x](https://example.com)')).toBe('[x](https://example.com)');
	});

	it('does not match uppercase in cuid', () => {
		expect(renderWordLinks('[x](/dictionary/ABC)')).toBe('[x](/dictionary/ABC)');
	});
});

describe('stripWordLinks', () => {
	it('returns empty string for null or undefined', () => {
		expect(stripWordLinks(null)).toBe('');
		expect(stripWordLinks(undefined)).toBe('');
	});

	it('passes plain text through unchanged', () => {
		expect(stripWordLinks('hello world')).toBe('hello world');
	});

	it('replaces a single link with its label', () => {
		expect(stripWordLinks('see [chamgei](/dictionary/abc123)')).toBe('see chamgei');
	});

	it('replaces multiple links with labels', () => {
		expect(stripWordLinks('[a](/dictionary/x1); [b](/dictionary/y2)')).toBe('a; b');
	});

	it('does not escape HTML (returns plain text)', () => {
		expect(stripWordLinks('<b>hello</b>')).toBe('<b>hello</b>');
	});
});

describe('buildWordLinkInsertion', () => {
	it('replaces the bracket region with a full link segment', () => {
		const result = buildWordLinkInsertion('hello [cha', 6, 10, {
			id: 'abc123',
			kalenjin: 'chamgei',
			href: '/dictionary/chamgei'
		});
		expect(result.nextValue).toBe('hello [chamgei](/dictionary/chamgei)');
		expect(result.nextCaret).toBe('hello [chamgei](/dictionary/chamgei)'.length);
	});

	it('preserves text after the caret', () => {
		const result = buildWordLinkInsertion('[cha rest', 0, 4, {
			id: 'abc',
			kalenjin: 'chamgei',
			href: '/dictionary/chamgei'
		});
		expect(result.nextValue).toBe('[chamgei](/dictionary/chamgei) rest');
		expect(result.nextCaret).toBe('[chamgei](/dictionary/chamgei)'.length);
	});

	it('handles trigger at position 0', () => {
		const result = buildWordLinkInsertion('[x', 0, 2, {
			id: 'cuidx',
			kalenjin: 'word',
			href: '/dictionary/word'
		});
		expect(result.nextValue).toBe('[word](/dictionary/word)');
		expect(result.nextCaret).toBe('[word](/dictionary/word)'.length);
	});

	it('sanitizes forbidden chars from the label', () => {
		const result = buildWordLinkInsertion('[', 0, 1, {
			id: 'cuidx',
			kalenjin: 'bad];label\nhere',
			href: '/dictionary/bad-label-here'
		});
		expect(result.nextValue).toBe('[badlabelhere](/dictionary/bad-label-here)');
	});

	it('falls back to an id URL when no href is provided', () => {
		const result = buildWordLinkInsertion('[cha', 0, 4, {
			id: 'abc123',
			kalenjin: 'chamgei'
		});
		expect(result.nextValue).toBe('[chamgei](/dictionary/abc123)');
	});
});

describe('rewriteLinkLabel', () => {
	it('rewrites the label for the target cuid', () => {
		expect(rewriteLinkLabel('see [chamgee](/dictionary/abc)', 'abc', 'chamgei')).toBe(
			'see [chamgei](/dictionary/chamgei)'
		);
	});

	it('rewrites multiple occurrences of the same cuid', () => {
		expect(
			rewriteLinkLabel('[a](/dictionary/abc) and [b](/dictionary/abc)', 'abc', 'new')
		).toBe('[new](/dictionary/new) and [new](/dictionary/new)');
	});

	it('rewrites slug links for the target word', () => {
		expect(
			rewriteLinkLabel(
				'[old](/dictionary/chamgei) and [legacy](/dictionary/abc)',
				['abc', 'chamgei'],
				'kongoi',
				'/dictionary/chamgei'
			)
		).toBe('[kongoi](/dictionary/chamgei) and [kongoi](/dictionary/chamgei)');
	});

	it('leaves links to other cuids untouched', () => {
		expect(
			rewriteLinkLabel('[a](/dictionary/abc) and [b](/dictionary/xyz)', 'abc', 'new')
		).toBe('[new](/dictionary/new) and [b](/dictionary/xyz)');
	});

	it('leaves non-link text untouched', () => {
		expect(rewriteLinkLabel('hello world', 'abc', 'new')).toBe('hello world');
	});

	it('sanitizes the new label of forbidden chars', () => {
		expect(rewriteLinkLabel('[a](/dictionary/abc)', 'abc', 'bad];label')).toBe(
			'[badlabel](/dictionary/bad-label)'
		);
	});
});
