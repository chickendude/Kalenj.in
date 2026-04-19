import { fail, redirect } from '@sveltejs/kit';
import { CEFR_LEVELS } from '$lib/course';
import {
	parseLineSeparatedEntries,
	parsePositiveInteger,
	parseCefrLevelValue,
	readText
} from '$lib/server/course-form';
import { prisma } from '$lib/server/prisma';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 100;
const SORT_OPTIONS = ['alpha-asc', 'alpha-desc'] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

function parseSortOption(value: string | null): SortOption {
	return value === 'alpha-desc' ? 'alpha-desc' : 'alpha-asc';
}

function buildBrowseUrl(level: string, query: string, sort: SortOption): string {
	const params = new URLSearchParams();
	params.set('level', level);

	if (query) {
		params.set('q', query);
	}

	if (sort !== 'alpha-asc') {
		params.set('sort', sort);
	}

	return `/cefr?${params.toString()}`;
}

export const load: PageServerLoad = async ({ url }) => {
	const selectedLevel =
		parseCefrLevelValue(url.searchParams.get('level') ?? '') ?? CEFR_LEVELS[0];
	const query = (url.searchParams.get('q') ?? '').trim();
	const sort = parseSortOption(url.searchParams.get('sort'));
	const requestedPage = parsePositiveInteger(url.searchParams.get('page'));

	const where = {
		level: selectedLevel,
		...(query
			? {
					english: {
						contains: query,
						mode: 'insensitive' as const
					}
				}
			: {})
	};

	const [levelCounts, coveredCounts, totalCount] = await Promise.all([
		prisma.cefrEnglishTarget.groupBy({
			by: ['level'],
			_count: { _all: true }
		}),
		prisma.cefrEnglishTarget.groupBy({
			by: ['level'],
			where: {
				coveredByLessonWordId: {
					not: null
				}
			},
			_count: { _all: true }
		}),
		prisma.cefrEnglishTarget.count({ where })
	]);

	const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
	const page = Math.min(requestedPage, totalPages);

	const targets = await prisma.cefrEnglishTarget.findMany({
		where,
		include: {
			coveredByLessonWord: {
				include: {
					lessonSection: {
						include: {
							lesson: true
						}
					}
				}
			}
		},
		orderBy: [{ english: sort === 'alpha-desc' ? 'desc' : 'asc' }],
		take: PAGE_SIZE,
		skip: (page - 1) * PAGE_SIZE
	});

	const totalByLevel = new Map(levelCounts.map((entry) => [entry.level, entry._count._all]));
	const coveredByLevel = new Map(coveredCounts.map((entry) => [entry.level, entry._count._all]));

	return {
		levels: CEFR_LEVELS,
		levelSummaries: CEFR_LEVELS.map((level) => ({
			level,
			totalCount: totalByLevel.get(level) ?? 0,
			coveredCount: coveredByLevel.get(level) ?? 0
		})),
		selectedLevel,
		query,
		sort,
		sortOptions: SORT_OPTIONS,
		targets,
		page,
		pageSize: PAGE_SIZE,
		totalCount,
		totalPages
	};
};

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		const level = parseCefrLevelValue(readText(formData, 'level'));
		const returnQuery = readText(formData, 'returnQuery');
		const returnSort = parseSortOption(readText(formData, 'returnSort'));
		const englishEntries = parseLineSeparatedEntries(readText(formData, 'englishList'));

		if (!level || englishEntries.length === 0) {
			return fail(400, {
				error: 'Level and at least one English reference are required.',
				values: {
					level: readText(formData, 'level'),
					englishList: readText(formData, 'englishList')
				}
			});
		}

		try {
			await prisma.$transaction(async (tx) => {
				const [existingForLevel, existingForEntries] = await Promise.all([
					tx.cefrEnglishTarget.findMany({
						where: { level },
						select: { id: true, english: true }
					}),
					tx.cefrEnglishTarget.findMany({
						where: {
							english: {
								in: englishEntries
							}
						},
						select: { id: true, english: true, level: true }
					})
				]);

				const existingForEntriesByEnglish = new Map(
					existingForEntries.map((entry) => [entry.english, entry])
				);
				const currentLevelWords = new Set(existingForLevel.map((entry) => entry.english));
				const submittedWords = new Set(englishEntries);

				const idsToDelete = existingForLevel
					.filter((entry) => !submittedWords.has(entry.english))
					.map((entry) => entry.id);
				const idsToMove = existingForEntries
					.filter((entry) => entry.level !== level)
					.map((entry) => entry.id);
				const wordsToCreate = englishEntries.filter(
					(english) => !existingForEntriesByEnglish.has(english)
				);
				const unchangedCount = englishEntries.filter((english) =>
					currentLevelWords.has(english)
				).length;

				if (idsToDelete.length > 0) {
					await tx.cefrEnglishTarget.deleteMany({
						where: {
							id: {
								in: idsToDelete
							}
						}
					});
				}

				if (idsToMove.length > 0) {
					await tx.cefrEnglishTarget.updateMany({
						where: {
							id: {
								in: idsToMove
							}
						},
						data: { level }
					});
				}

				if (wordsToCreate.length > 0) {
					await tx.cefrEnglishTarget.createMany({
						data: wordsToCreate.map((english) => ({
							level,
							english
						}))
					});
				}

				return {
					submittedCount: englishEntries.length,
					deletedCount: idsToDelete.length,
					movedCount: idsToMove.length,
					createdCount: wordsToCreate.length,
					unchangedCount
				};
			});
		} catch (error) {
			return fail(400, {
				error: 'Could not replace CEFR targets for this level.',
				values: {
					level,
					englishList: readText(formData, 'englishList')
				}
			});
		}

		redirect(303, buildBrowseUrl(level, returnQuery, returnSort));
	},
	update: async ({ request }) => {
		const formData = await request.formData();
		const id = readText(formData, 'id');
		const english = readText(formData, 'english');
		const level = parseCefrLevelValue(readText(formData, 'level'));
		const returnQuery = readText(formData, 'returnQuery');
		const returnSort = parseSortOption(readText(formData, 'returnSort'));

		if (!id || !level || !english) {
			return fail(400, {
				error: 'Level and English reference text are required.'
			});
		}

		try {
			await prisma.cefrEnglishTarget.update({
				where: { id },
				data: {
					level,
					english
				}
			});
		} catch (error) {
			return fail(400, {
				error: 'Could not update CEFR target.'
			});
		}

		redirect(303, buildBrowseUrl(level, returnQuery, returnSort));
	},
	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = readText(formData, 'id');
		const level = parseCefrLevelValue(readText(formData, 'level'));
		const returnQuery = readText(formData, 'returnQuery');
		const returnSort = parseSortOption(readText(formData, 'returnSort'));

		if (!id || !level) {
			return fail(400, { error: 'Target id and level are required.' });
		}

		await prisma.cefrEnglishTarget.delete({
			where: { id }
		});

		redirect(303, buildBrowseUrl(level, returnQuery, returnSort));
	}
};
