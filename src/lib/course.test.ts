import { describe, expect, it } from 'vitest';
import { getInsertedLessonOrder, getNextLessonOrder } from './course';

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
