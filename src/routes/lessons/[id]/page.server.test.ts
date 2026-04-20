import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions } from './+page.server';

const mocks = vi.hoisted(() => {
	const tx = {
		lessonSection: {
			findFirst: vi.fn(),
			create: vi.fn()
		},
		lessonWord: {
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn()
		}
	};

	const prisma = {
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
	for (const model of [mocks.prisma.lessonWord, mocks.prisma.word, mocks.tx.lessonSection, mocks.tx.lessonWord]) {
		for (const mock of Object.values(model)) {
			mock.mockReset();
		}
	}

	mocks.prisma.$transaction.mockReset();
	mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
	mocks.tx.lessonSection.findFirst.mockResolvedValue({ id: 'section-1' });
	mocks.tx.lessonWord.findMany.mockResolvedValue([]);
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

beforeEach(() => {
	resetMocks();
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
