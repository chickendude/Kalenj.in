import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

const mocks = vi.hoisted(() => {
	const prisma = {
		lesson: {
			findUnique: vi.fn()
		},
		lessonWord: {
			findMany: vi.fn()
		}
	};
	const searchWordsByKalenjin = vi.fn();
	return { prisma, searchWordsByKalenjin };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('$lib/server/guards', () => ({ requireEditor: vi.fn() }));
vi.mock('$lib/server/kalenjin-word-search', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/kalenjin-word-search')>(
		'$lib/server/kalenjin-word-search'
	);
	return {
		...actual,
		searchWordsByKalenjin: mocks.searchWordsByKalenjin
	};
});

beforeEach(() => {
	mocks.prisma.lesson.findUnique.mockReset();
	mocks.prisma.lessonWord.findMany.mockReset();
	mocks.searchWordsByKalenjin.mockReset();
});

describe('lesson word search usage warnings', () => {
	it('returns earlier lesson usage warnings but ignores later lesson usage', async () => {
		mocks.searchWordsByKalenjin.mockResolvedValue([
			{ id: 'word-1', kalenjin: 'achicha', translations: 'no', notes: null }
		]);
		mocks.prisma.lesson.findUnique.mockResolvedValue({ level: 'A1', lessonOrder: 9 });
		mocks.prisma.lessonWord.findMany.mockResolvedValue([
			{
				wordId: 'word-1',
				lessonSection: {
					lesson: { id: 'later-lesson', title: 'Later lesson', level: 'A1', lessonOrder: 11 }
				}
			},
			{
				wordId: 'word-1',
				lessonSection: {
					lesson: { id: 'earlier-lesson', title: 'Earlier lesson', level: 'A1', lessonOrder: 4 }
				}
			},
			{
				wordId: 'word-1',
				lessonSection: {
					lesson: { id: 'same-order-lesson', title: 'Same order lesson', level: 'A1', lessonOrder: 9 }
				}
			}
		]);

		const response = await GET({
			url: new URL('http://localhost/lessons/current/word-search?q=achicha'),
			params: { id: 'current' },
			locals: {
				user: { id: 'u1', username: 'tester', displayName: null, role: 'ADMIN' },
				sessionToken: 't'
			}
		} as never);

		await expect(response.json()).resolves.toMatchObject({
			results: [
				{
					id: 'word-1',
					otherLessons: [
						{
							id: 'earlier-lesson',
							title: 'Earlier lesson',
							level: 'A1',
							lessonOrder: 4,
							timing: 'earlier'
						},
						{
							id: 'same-order-lesson',
							title: 'Same order lesson',
							level: 'A1',
							lessonOrder: 9,
							timing: 'earlier'
						}
					]
				}
			]
		});
		expect(mocks.prisma.lessonWord.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					wordId: { in: ['word-1'] },
					lessonSection: {
						lessonId: { not: 'current' },
						lesson: {
							level: 'A1',
							type: 'VOCABULARY',
							lessonOrder: { lte: 9 }
						}
					}
				}
			})
		);
	});
});
