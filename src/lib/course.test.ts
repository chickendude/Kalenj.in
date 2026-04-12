import { describe, expect, it } from 'vitest';
import { getInsertedLessonOrder, getNextLessonOrder, splitLessonItemsIntoSections } from './course';

describe('getNextLessonOrder', () => {
	it('starts at one when there are no lessons yet', () => {
		expect(getNextLessonOrder([])).toBe(1);
	});

	it('returns one more than the highest lesson order', () => {
		expect(getNextLessonOrder([1, 2, 4])).toBe(5);
	});
});

describe('getInsertedLessonOrder', () => {
	it('uses the same order when inserting before a lesson', () => {
		expect(getInsertedLessonOrder(4, 'before')).toBe(4);
	});

	it('uses the next order when inserting after a lesson', () => {
		expect(getInsertedLessonOrder(4, 'after')).toBe(5);
	});
});

describe('splitLessonItemsIntoSections', () => {
	it('returns no sections for an empty list', () => {
		expect(splitLessonItemsIntoSections([])).toEqual([]);
	});

	it('balances fewer than fifteen items into two sections', () => {
		expect(splitLessonItemsIntoSections([1, 2, 3, 4, 5])).toEqual([
			{ sectionNumber: 1, items: [1, 2, 3] },
			{ sectionNumber: 2, items: [4, 5] }
		]);
	});

	it('balances more than fifteen items into three sections', () => {
		expect(splitLessonItemsIntoSections(Array.from({ length: 16 }, (_, index) => index + 1)).map((section) => section.items.length)).toEqual([6, 5, 5]);
	});
});
