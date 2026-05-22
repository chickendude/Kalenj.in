import { describe, expect, it, beforeEach, vi } from 'vitest';
import { findMatchingExampleSentence, formatSentenceInUseError } from './example-sentence-dedupe';

const findFirst = vi.fn();
const db = { exampleSentence: { findFirst } } as never;

beforeEach(() => {
	findFirst.mockReset();
});

describe('findMatchingExampleSentence', () => {
	it('matches case-insensitively on both kalenjin and english', async () => {
		findFirst.mockResolvedValue({ id: 'sent-1', lessonWords: [] });

		await findMatchingExampleSentence(db, 'Chamuni', 'Hello');

		expect(findFirst).toHaveBeenCalledWith({
			where: {
				kalenjin: { equals: 'Chamuni', mode: 'insensitive' },
				english: { equals: 'Hello', mode: 'insensitive' }
			},
			select: expect.objectContaining({ id: true })
		});
	});

	it('excludes a given sentence id when provided', async () => {
		findFirst.mockResolvedValue(null);

		await findMatchingExampleSentence(db, 'k', 'e', 'exclude-me');

		expect(findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ id: { not: 'exclude-me' } })
			})
		);
	});

	it('returns null when no sentence matches', async () => {
		findFirst.mockResolvedValue(null);

		await expect(findMatchingExampleSentence(db, 'k', 'e')).resolves.toBeNull();
	});

	it('returns the match with its first owning lesson word', async () => {
		findFirst.mockResolvedValue({
			id: 'sent-1',
			lessonWords: [
				{ id: 'lw-1', kalenjin: 'chamge', lessonSection: { lesson: { id: 'l-1', title: 'Greetings' } } }
			]
		});

		await expect(findMatchingExampleSentence(db, 'k', 'e')).resolves.toEqual({
			id: 'sent-1',
			lessonWord: {
				id: 'lw-1',
				kalenjin: 'chamge',
				lessonSection: { lesson: { id: 'l-1', title: 'Greetings' } }
			}
		});
	});

	it('returns lessonWord: null when the match has no owning lesson word', async () => {
		findFirst.mockResolvedValue({ id: 'sent-1', lessonWords: [] });

		await expect(findMatchingExampleSentence(db, 'k', 'e')).resolves.toEqual({
			id: 'sent-1',
			lessonWord: null
		});
	});
});

describe('formatSentenceInUseError', () => {
	it('names the owning word and lesson', () => {
		expect(
			formatSentenceInUseError({
				kalenjin: 'chamge',
				lessonSection: { lesson: { title: 'Greetings' } }
			})
		).toBe('This sentence is already used by "chamge" in lesson "Greetings".');
	});
});
