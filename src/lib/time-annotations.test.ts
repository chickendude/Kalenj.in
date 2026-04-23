import { describe, expect, it } from 'vitest';
import { annotateSentenceTimes, getSentenceTimeAnnotation } from './time-annotations';

describe('getSentenceTimeAnnotation', () => {
	it('converts Swahili clock times without a meridiem into Western time', () => {
		expect(getSentenceTimeAnnotation('6:00')).toEqual({
			sourceText: '6:00',
			westernTime: '12:00',
			note: 'In Kenya, the clock starts at sunrise (6 AM) and goes until sunset (6 PM). To convert to our time, you add 6 hours.'
		});
	});

	it('converts Swahili AM times into Western AM/PM time', () => {
		expect(getSentenceTimeAnnotation('7:15 AM')).toEqual({
			sourceText: '7:15 AM',
			westernTime: '1:15 PM',
			note: 'In Kenya, the clock starts at sunrise (6 AM) and goes until sunset (6 PM). To convert to our time, you add 6 hours.'
		});
	});

	it('supports hour-only times when a meridiem is present', () => {
		expect(getSentenceTimeAnnotation('6 PM')).toEqual({
			sourceText: '6:00 PM',
			westernTime: '12:00 AM',
			note: 'In Kenya, the clock starts at sunrise (6 AM) and goes until sunset (6 PM). To convert to our time, you add 6 hours.'
		});
	});

	it("supports o'clock times", () => {
		expect(getSentenceTimeAnnotation("10 o'clock")).toEqual({
			sourceText: '10:00',
			westernTime: '4:00',
			note: 'In Kenya, the clock starts at sunrise (6 AM) and goes until sunset (6 PM). To convert to our time, you add 6 hours.'
		});
		expect(getSentenceTimeAnnotation("10 o’clock PM")).toEqual({
			sourceText: '10:00 PM',
			westernTime: '4:00 AM',
			note: 'In Kenya, the clock starts at sunrise (6 AM) and goes until sunset (6 PM). To convert to our time, you add 6 hours.'
		});
	});

	it('ignores values that are not clearly times', () => {
		expect(getSentenceTimeAnnotation('6')).toBeNull();
		expect(getSentenceTimeAnnotation('14:00')).toBeNull();
	});
});

describe('annotateSentenceTimes', () => {
	it('wraps each detected time while leaving the rest of the sentence intact', () => {
		expect(annotateSentenceTimes('Tuonane 6:00, halafu 7 PM.')).toEqual([
			{ type: 'text', text: 'Tuonane ' },
			{
				type: 'time',
				text: '6:00',
				annotation: {
					sourceText: '6:00',
					westernTime: '12:00',
					note: 'In Kenya, the clock starts at sunrise (6 AM) and goes until sunset (6 PM). To convert to our time, you add 6 hours.'
				}
			},
			{ type: 'text', text: ', halafu ' },
			{
				type: 'time',
				text: '7 PM',
				annotation: {
					sourceText: '7:00 PM',
					westernTime: '1:00 AM',
					note: 'In Kenya, the clock starts at sunrise (6 AM) and goes until sunset (6 PM). To convert to our time, you add 6 hours.'
				}
			},
			{ type: 'text', text: '.' }
		]);
	});

	it("wraps o'clock times inside a sentence", () => {
		expect(annotateSentenceTimes("Fika 10 o'clock kesho.")).toEqual([
			{ type: 'text', text: 'Fika ' },
			{
				type: 'time',
				text: "10 o'clock",
				annotation: {
					sourceText: '10:00',
					westernTime: '4:00',
					note: 'In Kenya, the clock starts at sunrise (6 AM) and goes until sunset (6 PM). To convert to our time, you add 6 hours.'
				}
			},
			{ type: 'text', text: ' kesho.' }
		]);
	});
});
