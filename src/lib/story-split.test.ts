import { describe, expect, it } from 'vitest';
import { splitIntoSentences, splitSentenceText } from './story-split';

describe('splitSentenceText', () => {
	it('keeps a single sentence intact', () => {
		expect(splitSentenceText('Chamgei nebo langat.')).toEqual(['Chamgei nebo langat.']);
	});

	it('splits on period, question mark, and exclamation followed by whitespace', () => {
		expect(splitSentenceText('One. Two? Three!')).toEqual(['One.', 'Two?', 'Three!']);
	});

	it('preserves the trailing sentence when it has no terminator', () => {
		expect(splitSentenceText('One. Two')).toEqual(['One.', 'Two']);
	});

	it('returns an empty array for empty input', () => {
		expect(splitSentenceText('')).toEqual([]);
		expect(splitSentenceText('   ')).toEqual([]);
	});

	it('does not split on punctuation without trailing whitespace', () => {
		expect(splitSentenceText('3.14 is pi.')).toEqual(['3.14 is pi.']);
	});
});

describe('splitIntoSentences', () => {
	it('passes a single-sentence pair through unchanged', () => {
		expect(splitIntoSentences('Chamgei nebo langat.', 'Good evening.')).toEqual([
			{ kalenjin: 'Chamgei nebo langat.', english: 'Good evening.' }
		]);
	});

	it('zips balanced 3/3 splits 1:1', () => {
		const pairs = splitIntoSentences(
			'Iyo, nyon yat kot. Kaagurin saisiek chechang menyone iyate kot. Limin nee rani?',
			"Iyo, come open the house. I have called you several hours. What's disturbing you?"
		);

		expect(pairs).toEqual([
			{ kalenjin: 'Iyo, nyon yat kot.', english: 'Iyo, come open the house.' },
			{
				kalenjin: 'Kaagurin saisiek chechang menyone iyate kot.',
				english: 'I have called you several hours.'
			},
			{ kalenjin: 'Limin nee rani?', english: "What's disturbing you?" }
		]);
	});

	it('recognises ? and ! terminators alongside .', () => {
		expect(splitIntoSentences('Chamgei! Kilyan? Missing.', 'Hello! What? Fine.')).toEqual([
			{ kalenjin: 'Chamgei!', english: 'Hello!' },
			{ kalenjin: 'Kilyan?', english: 'What?' },
			{ kalenjin: 'Missing.', english: 'Fine.' }
		]);
	});

	it('keeps the last piece when it has no terminator', () => {
		expect(splitIntoSentences('One. Two? Three', 'Un. Deux? Trois')).toEqual([
			{ kalenjin: 'One.', english: 'Un.' },
			{ kalenjin: 'Two?', english: 'Deux?' },
			{ kalenjin: 'Three', english: 'Trois' }
		]);
	});

	it('dumps all english onto the first piece when counts mismatch', () => {
		expect(
			splitIntoSentences('One. Two. Three.', 'Three sentences combined into one English blob.')
		).toEqual([
			{ kalenjin: 'One.', english: 'Three sentences combined into one English blob.' },
			{ kalenjin: 'Two.', english: '' },
			{ kalenjin: 'Three.', english: '' }
		]);
	});

	it('keeps a single-kalenjin pair together even if english has multiple sentences', () => {
		expect(splitIntoSentences('Chamgei nebo langat', 'Hello! Good morning.')).toEqual([
			{ kalenjin: 'Chamgei nebo langat', english: 'Hello! Good morning.' }
		]);
	});
});
