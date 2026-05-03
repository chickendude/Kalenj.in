import { describe, expect, it } from 'vitest';
import {
	buildBulkSentenceReviewRows,
	normalizeBulkSentenceForReview,
	parseBulkSentenceText
} from './bulk-sentences';

describe('parseBulkSentenceText', () => {
	it('parses tab-delimited Kalenjin and English sentence pairs', () => {
		expect(parseBulkSentenceText('Labat kaa.\tRun home.\nLabat boisyet.\tRun to work.')).toEqual([
			{ lineNumber: 1, kalenjin: 'Labat kaa.', english: 'Run home.' },
			{ lineNumber: 2, kalenjin: 'Labat boisyet.', english: 'Run to work.' }
		]);
	});

	it('parses sentence pairs separated by an en dash delimiter', () => {
		expect(
			parseBulkSentenceText(`Achome alabat. – I like running.
Kichome kinet kee Kalenjin. – I like learning ("teaching myself") Kalenjin.`)
		).toEqual([
			{ lineNumber: 1, kalenjin: 'Achome alabat.', english: 'I like running.' },
			{
				lineNumber: 2,
				kalenjin: 'Kichome kinet kee Kalenjin.',
				english: 'I like learning ("teaching myself") Kalenjin.'
			}
		]);
	});

	it('ignores blank lines while preserving source line numbers', () => {
		expect(parseBulkSentenceText('\nLabat kaa. – Run home.\n\n')).toEqual([
			{ lineNumber: 2, kalenjin: 'Labat kaa.', english: 'Run home.' }
		]);
	});

	it('rejects lines without a supported delimiter', () => {
		expect(() => parseBulkSentenceText('Labat kaa. - Run home.')).toThrow(
			'Line 1: use either a tab or " – " between Kalenjin and English.'
		);
	});
});

describe('normalizeBulkSentenceForReview', () => {
	it('capitalizes the first word and adds periods to fields missing final punctuation', () => {
		expect(
			normalizeBulkSentenceForReview({
				lineNumber: 1,
				kalenjin: 'labat kaa',
				english: 'run home'
			})
		).toEqual({
			lineNumber: 1,
			kalenjin: 'Labat kaa.',
			english: 'run home.',
			warnings: [
				{
					field: 'kalenjin',
					code: 'missing-final-punctuation',
					message: 'Confirm punctuation'
				},
				{
					field: 'english',
					code: 'missing-final-punctuation',
					message: 'Confirm punctuation'
				}
			]
		});
	});

	it('marks capitalized words after the first word for review', () => {
		expect(
			normalizeBulkSentenceForReview({
				lineNumber: 1,
				kalenjin: 'Kichome kinet kee Kalenjin.',
				english: 'I like learning Kalenjin.'
			}).warnings
		).toEqual([
			{
				field: 'kalenjin',
				code: 'middle-capitalized-word',
				message: 'Check capitalization',
				words: ['Kalenjin']
			}
		]);
	});

	it('treats a unicode ellipsis as final punctuation', () => {
		expect(
			normalizeBulkSentenceForReview({
				lineNumber: 1,
				kalenjin: 'labat kaa…',
				english: 'run home…'
			})
		).toEqual({
			lineNumber: 1,
			kalenjin: 'Labat kaa…',
			english: 'run home…',
			warnings: []
		});
	});
});

describe('buildBulkSentenceReviewRows', () => {
	it('parses and normalizes pasted lines for review', () => {
		expect(buildBulkSentenceReviewRows('labat kaa\tRun home')).toEqual([
			{
				lineNumber: 1,
				kalenjin: 'Labat kaa.',
				english: 'Run home.',
				warnings: [
					{
						field: 'kalenjin',
						code: 'missing-final-punctuation',
						message: 'Confirm punctuation'
					},
					{
						field: 'english',
						code: 'missing-final-punctuation',
						message: 'Confirm punctuation'
					}
				]
			}
		]);
	});
});
