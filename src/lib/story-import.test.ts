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

	it('parses tab-delimited speaker columns without requiring colons', () => {
		const sentences = parseStoryImportText(`Moning'otiot\tIyo, nyon yat kot.\tIyo, come open the house.
Kwondo\tIyobu ano saisyek chebo kemoi.\tWhere are you coming from at these hours of the night?
Chelang'at\tAchicha, piron kametnyun ndo ayat kot.\tNo, my mother will beat me if I open the house.`);

		expect(sentences).toEqual([
			{
				sentenceOrder: 1,
				speaker: "Moning'otiot",
				kalenjin: 'Iyo, nyon yat kot.',
				english: 'Iyo, come open the house.'
			},
			{
				sentenceOrder: 2,
				speaker: 'Kwondo',
				kalenjin: 'Iyobu ano saisyek chebo kemoi.',
				english: 'Where are you coming from at these hours of the night?'
			},
			{
				sentenceOrder: 3,
				speaker: "Chelang'at",
				kalenjin: 'Achicha, piron kametnyun ndo ayat kot.',
				english: 'No, my mother will beat me if I open the house.'
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

	it('splits multi-sentence lines into individual story sentences', () => {
		const sentences = parseStoryImportText(
			"Iyo: / Iyo, nyon yat kot. Kaagurin saisiek chechang menyone iyate kot. Limin nee rani? / Iyo, come open the house. I have called you several hours, but you're not coming to open the house. What's disturbing you?"
		);

		expect(sentences).toEqual([
			{
				sentenceOrder: 1,
				speaker: 'Iyo',
				kalenjin: 'Iyo, nyon yat kot.',
				english: 'Iyo, come open the house.'
			},
			{
				sentenceOrder: 2,
				speaker: 'Iyo',
				kalenjin: 'Kaagurin saisiek chechang menyone iyate kot.',
				english: "I have called you several hours, but you're not coming to open the house."
			},
			{
				sentenceOrder: 3,
				speaker: 'Iyo',
				kalenjin: 'Limin nee rani?',
				english: "What's disturbing you?"
			}
		]);
	});

	it('keeps a multi-sentence line intact when english sentence count does not match', () => {
		const sentences = parseStoryImportText(
			'Chamgei! Missing kot.\tGood evening and a warm welcome.'
		);

		expect(sentences).toEqual([
			{
				sentenceOrder: 1,
				speaker: null,
				kalenjin: 'Chamgei!',
				english: 'Good evening and a warm welcome.'
			},
			{
				sentenceOrder: 2,
				speaker: null,
				kalenjin: 'Missing kot.',
				english: ''
			}
		]);
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
