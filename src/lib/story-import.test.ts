import { describe, expect, it } from 'vitest';
import { parseStoryImportText, validateStoryImportText } from './story-import';

describe('parseStoryImportText', () => {
	it('parses tab-delimited story text with speaker, kalenjin, and english columns', () => {
		const sentences = parseStoryImportText(`Michael:\tChamgei nebo langat.\tGood evening.
Chirchir:\tMissing kot.\tGood evening, too.`);

		expect(sentences).toEqual([
			{
				sentenceOrder: 1,
				speaker: 'Michael',
				kalenjin: 'Chamgei nebo langat.',
				english: 'Good evening.'
			},
			{
				sentenceOrder: 2,
				speaker: 'Chirchir',
				kalenjin: 'Missing kot.',
				english: 'Good evening, too.'
			}
		]);
	});

	it('parses lines without a speaker prefix', () => {
		expect(parseStoryImportText('Chamgei nebo langat.\tGood evening.')).toEqual([
			{
				sentenceOrder: 1,
				speaker: null,
				kalenjin: 'Chamgei nebo langat.',
				english: 'Good evening.'
			}
		]);
	});

	it('parses a speaker prefix embedded in the first column', () => {
		expect(parseStoryImportText('Michael: Chamgei nebo langat.\tGood evening.')).toEqual([
			{
				sentenceOrder: 1,
				speaker: 'Michael',
				kalenjin: 'Chamgei nebo langat.',
				english: 'Good evening.'
			}
		]);
	});

	it('ignores blank lines and keeps sentence ordering compact', () => {
		expect(parseStoryImportText('\nMichael:\tChamgei nebo langat.\tGood evening.\n\nChirchir:\tMissing kot.\tGood evening, too.\n')).toEqual([
			{
				sentenceOrder: 1,
				speaker: 'Michael',
				kalenjin: 'Chamgei nebo langat.',
				english: 'Good evening.'
			},
			{
				sentenceOrder: 2,
				speaker: 'Chirchir',
				kalenjin: 'Missing kot.',
				english: 'Good evening, too.'
			}
		]);
	});

	it('parses slash-delimited lines with speaker, kalenjin, and english', () => {
		expect(parseStoryImportText('Michael: / Chamgei nebo langat. / Good evening.')).toEqual([
			{
				sentenceOrder: 1,
				speaker: 'Michael',
				kalenjin: 'Chamgei nebo langat.',
				english: 'Good evening.'
			}
		]);
	});

	it('parses slash-delimited lines without a speaker', () => {
		expect(parseStoryImportText('Chamgei nebo langat. / Good evening.')).toEqual([
			{
				sentenceOrder: 1,
				speaker: null,
				kalenjin: 'Chamgei nebo langat.',
				english: 'Good evening.'
			}
		]);
	});

	it('prefers tabs over slashes when both are present', () => {
		expect(parseStoryImportText('A / B\tC / D')).toEqual([
			{
				sentenceOrder: 1,
				speaker: null,
				kalenjin: 'A / B',
				english: 'C / D'
			}
		]);
	});

	it('handles extra tabs between parts', () => {
		expect(parseStoryImportText('Michael:\t\t\tChamgei nebo langat.\t\tGood evening.')).toEqual([
			{
				sentenceOrder: 1,
				speaker: 'Michael',
				kalenjin: 'Chamgei nebo langat.',
				english: 'Good evening.'
			}
		]);
	});

	it('throws for invalid story lines without an English translation', () => {
		expect(() => parseStoryImportText('Michael:\tChamgei nebo langat.')).toThrow(
			'Story line 1 must include Kalenjin text and an English translation.'
		);
	});

	it('parses the full sample dialogue format used for story imports', () => {
		const sentences = parseStoryImportText(`Michael:\tChamgei nebo langat.\tGood evening.
Chirchir:\tMissing kot.\tGood evening, too.
Michael:\tAsiorore, tos kiame nee.\tI am hungry, what’s for dinner?
Chirchir:\tMursik, isagek ak kimyet.\tSour milk, spider plant and ugali.
Michael:\tOh eh, kararan, omoche achamcham omitwogik ab Kalenjin.\tWow that’s great, I would like to taste (some) Kalenjin foods.
Chirchir:\tItagat, inamen kimyet ak isagek asi itaren mursik.\tWelcome, start with ugali and spider plant, and then finish with sour milk.
Michael:\tKongoi, onyiny ago mindilil.\tThanks, (it tastes) nice and sour.
Chirchir:\tBoiboenjin.\tEnjoy.`);

		expect(sentences).toHaveLength(8);
		expect(sentences[0]).toEqual({
			sentenceOrder: 1,
			speaker: 'Michael',
			kalenjin: 'Chamgei nebo langat.',
			english: 'Good evening.'
		});
		expect(sentences[7]).toEqual({
			sentenceOrder: 8,
			speaker: 'Chirchir',
			kalenjin: 'Boiboenjin.',
			english: 'Enjoy.'
		});
	});
});

describe('validateStoryImportText', () => {
	it('returns null for valid story text', () => {
		expect(validateStoryImportText('Michael:\tChamgei nebo langat.\tGood evening.')).toBeNull();
	});

	it('returns null for empty text', () => {
		expect(validateStoryImportText('')).toBeNull();
	});

	it('returns error messages for invalid lines', () => {
		const result = validateStoryImportText('valid line\tTranslation\nno tabs here');

		expect(result).not.toBeNull();
		expect(result).toContain('Story line 2');
	});

	it('collects errors from multiple invalid lines', () => {
		const result = validateStoryImportText('bad line one\nbad line two');

		expect(result).not.toBeNull();
		expect(result).toContain('Story line 1');
		expect(result).toContain('Story line 2');
	});
});
