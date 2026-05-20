import { describe, expect, it } from 'vitest';
import { isDuplicateGroupVisible } from './duplicate-sentence-groups';

describe('isDuplicateGroupVisible', () => {
	it('hides a single sentence (not a duplicate group)', () => {
		expect(isDuplicateGroupVisible([{ isUnique: false }])).toBe(false);
	});

	it('shows a group of plain duplicates', () => {
		expect(isDuplicateGroupVisible([{ isUnique: false }, { isUnique: false }])).toBe(true);
	});

	it('still shows the group when only some copies are marked unique', () => {
		expect(isDuplicateGroupVisible([{ isUnique: true }, { isUnique: false }])).toBe(true);
	});

	it('hides the group only when every copy is marked unique', () => {
		expect(isDuplicateGroupVisible([{ isUnique: true }, { isUnique: true }])).toBe(false);
	});

	it('a new unmarked copy re-surfaces an otherwise all-unique group', () => {
		expect(
			isDuplicateGroupVisible([{ isUnique: true }, { isUnique: true }, { isUnique: false }])
		).toBe(true);
	});

	it('treats an empty group as not visible', () => {
		expect(isDuplicateGroupVisible([])).toBe(false);
	});
});
