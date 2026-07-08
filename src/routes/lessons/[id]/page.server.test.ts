import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	actions,
	_attachEarlierLessonUsages,
	_buildVocabCoverageLessonOrderFilter,
	_getVocabWordCoverage
} from './+page.server';

const mocks = vi.hoisted(() => {
	const tx = {
		lesson: {
			delete: vi.fn(),
			// syncLessonSlugs renumbers lesson-N/story-N slugs after deletion.
			findMany: vi.fn(),
			update: vi.fn()
		},
		lessonSection: {
			findFirst: vi.fn(),
			create: vi.fn()
		},
		lessonWord: {
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn()
		},
		exampleSentence: {
			deleteMany: vi.fn()
		},
		story: {
			delete: vi.fn()
		},
		storySentence: {
			findMany: vi.fn()
		}
	};

	const prisma = {
		lesson: {
			findUnique: vi.fn(),
			findFirst: vi.fn()
		},
		exampleSentenceToken: {
			findMany: vi.fn()
		},
		lessonWord: {
			findMany: vi.fn()
		},
		word: {
			findUnique: vi.fn()
		},
		$transaction: vi.fn()
	};

	return { prisma, tx };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

function resetMocks() {
	for (const model of [
		mocks.prisma.lesson,
		mocks.prisma.exampleSentenceToken,
		mocks.prisma.lessonWord,
		mocks.prisma.word,
		mocks.tx.lesson,
		mocks.tx.lessonSection,
		mocks.tx.lessonWord,
		mocks.tx.exampleSentence,
		mocks.tx.story,
		mocks.tx.storySentence
	]) {
		for (const mock of Object.values(model)) {
			mock.mockReset();
		}
	}

	mocks.prisma.$transaction.mockReset();
	mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
	mocks.tx.lessonSection.findFirst.mockResolvedValue({ id: 'section-1' });
	mocks.tx.lesson.findMany.mockResolvedValue([]);
	mocks.tx.lessonWord.findMany.mockResolvedValue([]);
	mocks.tx.storySentence.findMany.mockResolvedValue([]);
}

async function reorderWords(orderedIds: unknown, lessonId = 'lesson-1') {
	const formData = new FormData();
	formData.set('orderedIds', typeof orderedIds === 'string' ? orderedIds : JSON.stringify(orderedIds));

	return actions.reorderWords?.({
		params: { id: lessonId },
		locals: { user: { id: 'u1', username: 'tester', displayName: null, role: 'ADMIN' }, sessionToken: 't' },
		request: new Request('http://localhost/lessons/lesson-1', {
			method: 'POST',
			body: formData
		})
	} as never);
}

async function quickAddWord(wordId = 'word-1', lessonId = 'lesson-1') {
	const formData = new FormData();
	formData.set('wordId', wordId);
	formData.set('sentenceKalenjin', 'Ignored story sentence');
	formData.set('sentenceEnglish', 'Ignored story translation');

	return actions.quickAddWord?.({
		params: { id: lessonId },
		locals: { user: { id: 'u1', username: 'tester', displayName: null, role: 'ADMIN' }, sessionToken: 't' },
		request: new Request('http://localhost/lessons/lesson-1', {
			method: 'POST',
			body: formData
		})
	} as never);
}

async function deleteLesson(lessonId = 'lesson-1') {
	return actions.deleteLesson?.({
		params: { id: lessonId },
		locals: {
			user: { id: 'u1', username: 'tester', displayName: null, role: 'ADMIN' },
			sessionToken: 't'
		}
	} as never);
}

beforeEach(() => {
	resetMocks();
});

describe('_buildVocabCoverageLessonOrderFilter', () => {
	it('includes later vocabulary lessons before the next story', () => {
		expect(_buildVocabCoverageLessonOrderFilter(3)).toEqual({ lt: 3 });
	});
});

describe('_getVocabWordCoverage', () => {
	it('counts every vocabulary lesson before the next story, not only the current run', async () => {
		mocks.prisma.lesson.findFirst.mockResolvedValue({
			id: 'story-lesson',
			title: 'Next story',
			lessonOrder: 10,
			storyId: 'story-1'
		});
		mocks.prisma.exampleSentenceToken.findMany.mockResolvedValue([
			{
				wordId: 'earlier-word',
				word: { id: 'earlier-word', kalenjin: 'ago', translations: 'but' },
				exampleSentence: {
					id: 'sentence-1',
					kalenjin: 'ago',
					english: 'but',
					storySentence: { sentenceOrder: 1 }
				}
			},
			{
				wordId: 'current-word',
				word: { id: 'current-word', kalenjin: 'am', translations: 'eat' },
				exampleSentence: {
					id: 'sentence-2',
					kalenjin: 'am',
					english: 'eat',
					storySentence: { sentenceOrder: 2 }
				}
			},
			{
				wordId: 'missing-word',
				word: { id: 'missing-word', kalenjin: 'missing', translations: 'missing' },
				exampleSentence: {
					id: 'sentence-3',
					kalenjin: 'missing',
					english: 'missing',
					storySentence: { sentenceOrder: 3 }
				}
			}
		]);
		mocks.prisma.lessonWord.findMany
			.mockResolvedValueOnce([{ wordId: 'earlier-word' }, { wordId: 'current-word' }])
			.mockResolvedValueOnce([
				{
					wordId: 'earlier-word',
					lessonSection: {
						lesson: { id: 'earlier-lesson', title: 'Earlier lesson', level: 'A1', lessonOrder: 2 }
					}
				},
				{
					wordId: 'current-word',
					lessonSection: {
						lesson: { id: 'later-lesson', title: 'Later lesson', level: 'A1', lessonOrder: 11 }
					}
				}
			]);

		const coverage = await _getVocabWordCoverage({
			id: 'lesson-9',
			type: 'VOCABULARY',
			level: 'A1',
			lessonOrder: 9
		});

		expect(mocks.prisma.lessonWord.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					lessonSection: {
						lesson: {
							level: 'A1',
							type: 'VOCABULARY',
							lessonOrder: { lt: 10 }
						}
					}
				}
			})
		);
		expect(mocks.prisma.lessonWord.findMany).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				where: expect.objectContaining({
					wordId: { in: ['earlier-word', 'current-word', 'missing-word'] },
					lessonSection: {
						lessonId: { not: 'lesson-9' },
						lesson: {
							level: 'A1',
							type: 'VOCABULARY',
							lessonOrder: { lte: 9 }
						}
					}
				})
			})
		);
		expect(coverage?.words.map((entry) => [entry.word.id, entry.introduced])).toEqual([
			['missing-word', false],
			['earlier-word', true],
			['current-word', true]
		]);
		expect(coverage?.words.find((entry) => entry.word.id === 'earlier-word')?.otherLessons).toEqual([
			{
				id: 'earlier-lesson',
				title: 'Earlier lesson',
				level: 'A1',
				lessonOrder: 2,
				timing: 'earlier'
			}
		]);
		expect(coverage?.words.find((entry) => entry.word.id === 'current-word')?.otherLessons).toEqual(
			[]
		);
	});

	it('skips incomplete story lessons when finding the next coverage story', async () => {
		mocks.prisma.lesson.findFirst.mockResolvedValue({
			id: 'story-lesson',
			title: 'Ready story',
			lessonOrder: 12,
			storyId: 'story-2'
		});
		mocks.prisma.exampleSentenceToken.findMany.mockResolvedValue([]);
		mocks.prisma.lessonWord.findMany.mockResolvedValue([]);

		await _getVocabWordCoverage({
			id: 'lesson-9',
			type: 'VOCABULARY',
			level: 'A1',
			lessonOrder: 9
		});

		expect(mocks.prisma.lesson.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					storyId: { not: null }
				})
			})
		);
	});
});

describe('_attachEarlierLessonUsages', () => {
	it('adds previous lesson usage warnings to existing lesson words', async () => {
		mocks.prisma.lessonWord.findMany.mockResolvedValue([
			{
				wordId: 'word-1',
				lessonSection: {
					lesson: { id: 'lesson-middle', title: 'Middle lesson', level: 'A1', lessonOrder: 7 }
				}
			},
			{
				wordId: 'word-1',
				lessonSection: {
					lesson: { id: 'lesson-before', title: 'Earlier lesson', level: 'A1', lessonOrder: 4 }
				}
			}
		]);

		const lesson = await _attachEarlierLessonUsages({
			id: 'current-lesson',
			level: 'A1',
			lessonOrder: 11,
			sections: [
				{
					id: 'section-1',
					words: [
						{ id: 'lesson-word-1', wordId: 'word-1' },
						{ id: 'lesson-word-2', wordId: 'word-2' }
					]
				}
			]
		});

		expect(mocks.prisma.lessonWord.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					wordId: { in: ['word-1', 'word-2'] },
					lessonSection: {
						lessonId: { not: 'current-lesson' },
						lesson: {
							level: 'A1',
							type: 'VOCABULARY',
							lessonOrder: { lte: 11 }
						}
					}
				}
			})
		);
		expect(lesson.sections[0].words[0]).toMatchObject({
			id: 'lesson-word-1',
			otherLessons: [
				{
					id: 'lesson-before',
					title: 'Earlier lesson',
					level: 'A1',
					lessonOrder: 4,
					timing: 'earlier'
				},
				{
					id: 'lesson-middle',
					title: 'Middle lesson',
					level: 'A1',
					lessonOrder: 7,
					timing: 'earlier'
				}
			]
		});
		expect(lesson.sections[0].words[1]).toMatchObject({
			id: 'lesson-word-2',
			otherLessons: []
		});
	});
});

describe('reorderWords action', () => {
	it('persists the submitted lesson word order with temporary orders first', async () => {
		mocks.prisma.lessonWord.findMany.mockResolvedValue([
			{ id: 'word-a', itemOrder: 1 },
			{ id: 'word-b', itemOrder: 2 },
			{ id: 'word-c', itemOrder: 3 }
		]);

		await expect(reorderWords(['word-b', 'word-a', 'word-c'])).resolves.toEqual({
			reorderWordsSuccess: true
		});

		expect(mocks.prisma.lessonWord.findMany).toHaveBeenCalledWith({
			where: {
				lessonSection: {
					lessonId: 'lesson-1'
				}
			},
			select: {
				id: true,
				itemOrder: true
			}
		});
		expect(mocks.tx.lessonWord.update).toHaveBeenNthCalledWith(1, {
			where: { id: 'word-a' },
			data: { itemOrder: -3 }
		});
		expect(mocks.tx.lessonWord.update).toHaveBeenNthCalledWith(2, {
			where: { id: 'word-b' },
			data: { itemOrder: -4 }
		});
		expect(mocks.tx.lessonWord.update).toHaveBeenNthCalledWith(3, {
			where: { id: 'word-c' },
			data: { itemOrder: -5 }
		});
		expect(mocks.tx.lessonWord.update).toHaveBeenNthCalledWith(4, {
			where: { id: 'word-b' },
			data: { lessonSectionId: 'section-1', itemOrder: 1 }
		});
		expect(mocks.tx.lessonWord.update).toHaveBeenNthCalledWith(5, {
			where: { id: 'word-a' },
			data: { lessonSectionId: 'section-1', itemOrder: 2 }
		});
		expect(mocks.tx.lessonWord.update).toHaveBeenNthCalledWith(6, {
			where: { id: 'word-c' },
			data: { lessonSectionId: 'section-1', itemOrder: 3 }
		});
	});

	it('rejects duplicate submitted ids before touching the database', async () => {
		await expect(reorderWords(['word-a', 'word-a'])).resolves.toMatchObject({
			status: 400,
			data: { error: 'Word order must include each lesson word once.' }
		});

		expect(mocks.prisma.lessonWord.findMany).not.toHaveBeenCalled();
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});

	it('rejects malformed JSON before touching the database', async () => {
		await expect(reorderWords('not-json')).resolves.toMatchObject({
			status: 400,
			data: { error: 'Could not read the new word order.' }
		});

		expect(mocks.prisma.lessonWord.findMany).not.toHaveBeenCalled();
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});

	it('rejects empty submitted orders before touching the database', async () => {
		await expect(reorderWords([])).resolves.toMatchObject({
			status: 400,
			data: { error: 'Word order must include each lesson word once.' }
		});

		expect(mocks.prisma.lessonWord.findMany).not.toHaveBeenCalled();
		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});

	it('rejects orders that do not match the lesson words', async () => {
		mocks.prisma.lessonWord.findMany.mockResolvedValue([
			{ id: 'word-a', itemOrder: 1 },
			{ id: 'word-b', itemOrder: 2 }
		]);

		await expect(reorderWords(['word-a', 'word-c'])).resolves.toMatchObject({
			status: 400,
			data: { error: 'Word order does not match this lesson.' }
		});

		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
	});
});

describe('quickAddWord action', () => {
	it('adds the word without creating or attaching an example sentence', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue({
			id: 'word-1',
			kalenjin: 'chamgei',
			translations: 'hello'
		});

		await expect(quickAddWord()).resolves.toEqual({ quickAddWordSuccess: true });

		expect(mocks.tx.lessonWord.create).toHaveBeenCalledWith({
			data: {
				lessonSectionId: 'section-1',
				wordId: 'word-1',
				kalenjin: 'chamgei',
				translations: 'hello',
				itemOrder: 1
			}
		});
	});
});

describe('deleteLesson action', () => {
	it('deletes story-owned example sentences after removing the story placements', async () => {
		mocks.prisma.lesson.findUnique.mockResolvedValue({
			storyId: 'story-1',
			story: {
				sentences: [
					{ exampleSentenceId: 'story-example-1' },
					{ exampleSentenceId: 'story-example-2' }
				]
			},
			sections: [
				{
					words: [{ sentenceId: 'lesson-example-1' }]
				}
			]
		});
		mocks.tx.lessonWord.findMany.mockResolvedValue([]);

		await expect(deleteLesson()).rejects.toMatchObject({
			status: 303,
			location: '/lessons'
		});

		expect(mocks.tx.lesson.delete).toHaveBeenCalledWith({ where: { id: 'lesson-1' } });
		expect(mocks.tx.story.delete).toHaveBeenCalledWith({ where: { id: 'story-1' } });
		expect(mocks.tx.lessonWord.findMany).toHaveBeenCalledWith({
			where: {
				sentenceId: { in: ['lesson-example-1', 'story-example-1', 'story-example-2'] }
			},
			select: { sentenceId: true }
		});
		expect(mocks.tx.storySentence.findMany).toHaveBeenCalledWith({
			where: {
				exampleSentenceId: { in: ['lesson-example-1', 'story-example-1', 'story-example-2'] }
			},
			select: { exampleSentenceId: true }
		});
		expect(mocks.tx.exampleSentence.deleteMany).toHaveBeenCalledWith({
			where: { id: { in: ['lesson-example-1', 'story-example-1', 'story-example-2'] } }
		});
		expect(mocks.tx.story.delete.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.tx.exampleSentence.deleteMany.mock.invocationCallOrder[0]
		);
	});

	it('keeps story example sentences that are still referenced by another lesson word', async () => {
		mocks.prisma.lesson.findUnique.mockResolvedValue({
			storyId: 'story-1',
			story: {
				sentences: [
					{ exampleSentenceId: 'story-example-1' },
					{ exampleSentenceId: 'shared-example' }
				]
			},
			sections: []
		});
		mocks.tx.lessonWord.findMany.mockResolvedValue([{ sentenceId: 'shared-example' }]);

		await expect(deleteLesson()).rejects.toMatchObject({
			status: 303,
			location: '/lessons'
		});

		expect(mocks.tx.story.delete).toHaveBeenCalledWith({ where: { id: 'story-1' } });
		expect(mocks.tx.exampleSentence.deleteMany).toHaveBeenCalledWith({
			where: { id: { in: ['story-example-1'] } }
		});
	});

	it('keeps lesson word examples that are still used by story placements', async () => {
		mocks.prisma.lesson.findUnique.mockResolvedValue({
			storyId: null,
			story: null,
			sections: [
				{
					words: [{ sentenceId: 'shared-story-example' }]
				}
			]
		});
		mocks.tx.lessonWord.findMany.mockResolvedValue([]);
		mocks.tx.storySentence.findMany.mockResolvedValue([
			{ exampleSentenceId: 'shared-story-example' }
		]);

		await expect(deleteLesson()).rejects.toMatchObject({
			status: 303,
			location: '/lessons'
		});

		expect(mocks.tx.exampleSentence.deleteMany).not.toHaveBeenCalled();
	});
});
