import { fail, redirect } from '@sveltejs/kit';
import {
	CEFR_LEVELS,
	LESSON_TYPES,
	VOCABULARY_LESSON_TYPES,
	getInsertedLessonOrder,
	getNextLessonOrder
} from '$lib/course';
import {
	parseCefrLevelValue,
	parseLessonTypeValue,
	parseLineSeparatedEntries,
	parsePositiveInteger,
	parseVocabularyLessonTypeValue,
	readOptionalText,
	readText
} from '$lib/server/course-form';
import { prisma } from '$lib/server/prisma';
import { validateStoryImportText } from '$lib/story-import';
import { syncStorySentences } from '$lib/server/story-sync';
import { requireEditor } from '$lib/server/guards';
import type { Prisma } from '@prisma/client';
import type { Actions, PageServerLoad } from './$types';

const CEFR_PAGE_SIZE = 100;
const CEFR_SORT_OPTIONS = ['alpha-asc', 'alpha-desc'] as const;
type CefrSortOption = (typeof CEFR_SORT_OPTIONS)[number];

const CEFR_COVERAGE_FILTERS = ['all', 'covered', 'uncovered'] as const;
type CefrCoverageFilter = (typeof CEFR_COVERAGE_FILTERS)[number];

function parseCefrSortOption(value: string | null): CefrSortOption {
	return value === 'alpha-desc' ? 'alpha-desc' : 'alpha-asc';
}

function parseCefrCoverageFilter(value: string | null): CefrCoverageFilter {
	return value === 'covered' || value === 'uncovered' ? value : 'all';
}

function parseCefrPosFilters(value: string | null): string[] {
	if (!value) return [];

	return [
		...new Set(
			value
				.split(',')
				.map((token) => token.trim().toLowerCase())
				.filter(Boolean)
		)
	];
}

function extractPosTokens(english: string): string[] {
	const match = english.match(/\(([^)]+)\)/);

	if (!match) {
		return [];
	}

	return match[1]
		.split('/')
		.map((token) => token.trim().toLowerCase())
		.filter(Boolean);
}

function buildLessonsUrl(
	level: string,
	query: string,
	sort: CefrSortOption,
	page = 1,
	coverage: CefrCoverageFilter = 'all',
	pos: string[] = []
): string {
	const params = new URLSearchParams();
	params.set('level', level);

	if (query) {
		params.set('q', query);
	}

	if (sort !== 'alpha-asc') {
		params.set('sort', sort);
	}

	if (page > 1) {
		params.set('page', String(page));
	}

	if (coverage !== 'all') {
		params.set('covered', coverage === 'covered' ? 'yes' : 'no');
	}

	if (pos.length > 0) {
		params.set('pos', pos.join(','));
	}

	return `/lessons?${params.toString()}`;
}

async function shiftLessonsForInsert(
	tx: Prisma.TransactionClient,
	level: (typeof CEFR_LEVELS)[number],
	lessonOrder: number
): Promise<void> {
	const lessonsToShift = await tx.lesson.findMany({
		where: {
			level,
			lessonOrder: {
				gte: lessonOrder
			}
		},
		orderBy: {
			lessonOrder: 'desc'
		},
		select: {
			id: true,
			lessonOrder: true
		}
	});

	for (const lesson of lessonsToShift) {
		await tx.lesson.update({
			where: { id: lesson.id },
			data: { lessonOrder: lesson.lessonOrder + 1 }
		});
	}
}

async function createLessonRecord(
	tx: Prisma.TransactionClient,
	{
		title,
		level,
		lessonOrder,
		type,
		vocabularyType,
		grammarMarkdown,
		storyImportText
	}: {
		title: string;
		level: (typeof CEFR_LEVELS)[number];
		lessonOrder: number;
		type: NonNullable<ReturnType<typeof parseLessonTypeValue>>;
		vocabularyType: ReturnType<typeof parseVocabularyLessonTypeValue>;
		grammarMarkdown: string | null;
		storyImportText: string | null;
	}
) {
	const story =
		type === 'STORY'
			? await tx.story.create({
					data: {
						title
					}
				})
			: null;

	if (story && storyImportText) {
		await syncStorySentences(tx, story.id, storyImportText);
	}

	return tx.lesson.create({
		data: {
			title,
			level,
			lessonOrder,
			type,
			vocabularyType: type === 'VOCABULARY' ? vocabularyType : null,
			grammarMarkdown: type === 'VOCABULARY' ? grammarMarkdown : null,
			storyId: story?.id ?? null
		}
	});
}

async function getUninstructedWordsByLessonId(
	level: (typeof CEFR_LEVELS)[number],
	lessons: Array<{ id: string; level: string; lessonOrder: number; type: string; storyId: string | null }>
): Promise<Map<string, Array<{ id: string; kalenjin: string; translations: string }>>> {
	const levelLessons = lessons.filter((l) => l.level === level);
	const storyLessons = levelLessons.filter((l) => l.type === 'STORY' && l.storyId);
	const vocabLessons = levelLessons.filter((l) => l.type === 'VOCABULARY');

	if (storyLessons.length === 0) {
		return new Map();
	}

	const storyIds = storyLessons.map((l) => l.storyId!);

	const [tokenRows, lessonWordRows] = await Promise.all([
		prisma.storySentenceToken.findMany({
			where: {
				wordId: { not: null },
				storySentence: { storyId: { in: storyIds } }
			},
			select: {
				wordId: true,
				storySentence: { select: { storyId: true } },
				word: { select: { id: true, kalenjin: true, translations: true } }
			}
		}),
		vocabLessons.length > 0
			? prisma.lessonWord.findMany({
					where: { lessonSection: { lessonId: { in: vocabLessons.map((l) => l.id) } } },
					select: { wordId: true, lessonSection: { select: { lessonId: true } } }
				})
			: Promise.resolve([])
	]);

	// storyId -> Map<wordId, word>
	const wordsByStoryId = new Map<string, Map<string, { id: string; kalenjin: string; translations: string }>>();
	for (const token of tokenRows) {
		if (!token.wordId || !token.word) continue;
		const storyId = token.storySentence.storyId;
		if (!wordsByStoryId.has(storyId)) wordsByStoryId.set(storyId, new Map());
		wordsByStoryId.get(storyId)!.set(token.wordId, token.word);
	}

	// lessonId -> Set<wordId>
	const vocabWordIdsByLessonId = new Map<string, Set<string>>();
	for (const lw of lessonWordRows) {
		if (!lw.wordId) continue;
		const lessonId = lw.lessonSection.lessonId;
		if (!vocabWordIdsByLessonId.has(lessonId)) vocabWordIdsByLessonId.set(lessonId, new Set());
		vocabWordIdsByLessonId.get(lessonId)!.add(lw.wordId);
	}

	const result = new Map<string, Array<{ id: string; kalenjin: string; translations: string }>>();

	for (const storyLesson of storyLessons) {
		const introducedBefore = new Set<string>();
		for (const vocabLesson of vocabLessons) {
			if (vocabLesson.lessonOrder < storyLesson.lessonOrder) {
				for (const wordId of vocabWordIdsByLessonId.get(vocabLesson.id) ?? []) {
					introducedBefore.add(wordId);
				}
			}
		}

		const storyWords = [...(wordsByStoryId.get(storyLesson.storyId!) ?? new Map()).values()];
		const uninstructed = storyWords
			.filter((w) => !introducedBefore.has(w.id))
			.sort((a, b) => a.kalenjin.localeCompare(b.kalenjin));

		result.set(storyLesson.id, uninstructed);
	}

	return result;
}
export const load: PageServerLoad = async ({ url, locals }) => {
	requireEditor(locals);
	const selectedLevel =
		parseCefrLevelValue(url.searchParams.get('level') ?? '') ?? CEFR_LEVELS[0];
	const cefrQuery = (url.searchParams.get('q') ?? '').trim();
	const cefrSort = parseCefrSortOption(url.searchParams.get('sort'));
	const requestedCefrPage = parsePositiveInteger(url.searchParams.get('page'));
	const coveredParam = url.searchParams.get('covered');
	const cefrCoverageFilter: CefrCoverageFilter =
		coveredParam === 'yes'
			? 'covered'
			: coveredParam === 'no'
				? 'uncovered'
				: 'all';
	const cefrPosFilters = parseCefrPosFilters(url.searchParams.get('pos'));

	const lessons = await prisma.lesson.findMany({
		include: {
			story: true,
			_count: {
				select: {
					sections: true
				}
			}
		},
		orderBy: [{ level: 'asc' }, { lessonOrder: 'asc' }]
	});

	const uninstructedWordsMap = await getUninstructedWordsByLessonId(selectedLevel, lessons);

	const [cefrLevelCounts, cefrCoveredCounts, cefrLevelTargets] = await Promise.all([
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
		prisma.cefrEnglishTarget.findMany({
			where: { level: selectedLevel },
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
			orderBy: [{ english: cefrSort === 'alpha-desc' ? 'desc' : 'asc' }]
		})
	]);

	const posTokenCounts = new Map<string, number>();
	const targetsWithPos = cefrLevelTargets.map((target) => {
		const tokens = extractPosTokens(target.english);
		for (const token of tokens) {
			posTokenCounts.set(token, (posTokenCounts.get(token) ?? 0) + 1);
		}
		return { target, posTokens: tokens };
	});

	const posFilterSet = new Set(cefrPosFilters);
	const queryLower = cefrQuery.toLowerCase();

	const filteredTargets = targetsWithPos
		.filter(({ target }) => {
			if (queryLower && !target.english.toLowerCase().includes(queryLower)) {
				return false;
			}
			if (cefrCoverageFilter === 'covered' && !target.coveredByLessonWord) {
				return false;
			}
			if (cefrCoverageFilter === 'uncovered' && target.coveredByLessonWord) {
				return false;
			}
			return true;
		})
		.filter(({ posTokens }) => {
			if (posFilterSet.size === 0) {
				return true;
			}
			if (posFilterSet.has('(none)')) {
				if (posTokens.length === 0) {
					return true;
				}
			}
			return posTokens.some((token) => posFilterSet.has(token));
		})
		.map(({ target }) => target);

	const cefrFilteredCount = filteredTargets.length;
	const cefrTotalPages = Math.max(1, Math.ceil(cefrFilteredCount / CEFR_PAGE_SIZE));
	const cefrPage = Math.min(requestedCefrPage, cefrTotalPages);
	const cefrTargets = filteredTargets.slice(
		(cefrPage - 1) * CEFR_PAGE_SIZE,
		cefrPage * CEFR_PAGE_SIZE
	);

	const cefrPosOptions = [...posTokenCounts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([token, count]) => ({ token, count }));

	const cefrTotalByLevel = new Map(cefrLevelCounts.map((entry) => [entry.level, entry._count._all]));
	const cefrCoveredByLevel = new Map(
		cefrCoveredCounts.map((entry) => [entry.level, entry._count._all])
	);

	return {
		levels: CEFR_LEVELS,
		selectedLevel,
		levelSummaries: CEFR_LEVELS.map((level) => ({
			level,
			lessonCount: lessons.filter((lesson) => lesson.level === level).length,
			cefrTotalCount: cefrTotalByLevel.get(level) ?? 0,
			cefrCoveredCount: cefrCoveredByLevel.get(level) ?? 0
		})),
		lessonTypes: LESSON_TYPES,
		vocabularyTypes: VOCABULARY_LESSON_TYPES,
		lessons,
		selectedLevelLessons: lessons.filter((lesson) => lesson.level === selectedLevel),
		nextLessonOrder: getNextLessonOrder(
			lessons
				.filter((lesson) => lesson.level === selectedLevel)
				.map((lesson) => lesson.lessonOrder)
		),
		uninstructedWordsByLessonId: Object.fromEntries(uninstructedWordsMap),
		cefrQuery,
		cefrSort,
		cefrSortOptions: CEFR_SORT_OPTIONS,
		cefrCoverageFilter,
		cefrPosFilters,
		cefrPosOptions,
		cefrTargets,
		cefrPage,
		cefrPageSize: CEFR_PAGE_SIZE,
		cefrFilteredCount,
		cefrTotalPages
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireEditor(locals);
		const formData = await request.formData();
		const title = readText(formData, 'title');
		const level = parseCefrLevelValue(readText(formData, 'level'));
		const type = parseLessonTypeValue(readText(formData, 'type'));
		const vocabularyType = parseVocabularyLessonTypeValue(readText(formData, 'vocabularyType'));
		const grammarMarkdown = readOptionalText(formData, 'grammarMarkdown');
		const storyImportText = readOptionalText(formData, 'storyImportText');

		if (!title || !level || !type) {
			return fail(400, {
				error: 'Level, title, and type are required.',
				values: {
					title,
					level: readText(formData, 'level'),
					type: readText(formData, 'type'),
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? ''
				}
			});
		}

		if (type === 'VOCABULARY' && !vocabularyType) {
			return fail(400, {
				error: 'Vocabulary lessons must have a vocabulary type.',
				values: {
					title,
					level,
					type,
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? ''
				}
			});
		}

		if (type === 'STORY' && storyImportText) {
			const importError = validateStoryImportText(storyImportText);

			if (importError) {
				return fail(400, {
					error: importError,
					values: {
						title,
						level,
						type,
						vocabularyType: readText(formData, 'vocabularyType'),
						grammarMarkdown: grammarMarkdown ?? ''
					}
				});
			}
		}

		const nextLessonOrder = getNextLessonOrder(
			(
				await prisma.lesson.findMany({
					where: { level },
					select: { lessonOrder: true }
				})
			).map((lesson) => lesson.lessonOrder)
		);

		let lessonId: string;

		try {
			const lesson = await prisma.$transaction(async (tx) => {
				return createLessonRecord(tx, {
					title,
					level,
					lessonOrder: nextLessonOrder,
					type,
					vocabularyType,
					grammarMarkdown,
					storyImportText
				});
			});

			lessonId = lesson.id;
		} catch (error) {
			return fail(400, {
				error: 'Could not create lesson. Check for duplicate lesson order or story assignment.',
				values: {
					title,
					level,
					type,
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? ''
				}
			});
		}

		redirect(303, `/lessons/${lessonId}`);
	},
	createAdjacent: async ({ request, locals }) => {
		requireEditor(locals);
		const formData = await request.formData();
		const title = readText(formData, 'title');
		const anchorLessonId = readText(formData, 'anchorLessonId');
		const positionValue = readText(formData, 'position');
		const type = parseLessonTypeValue(readText(formData, 'type'));
		const vocabularyType = parseVocabularyLessonTypeValue(readText(formData, 'vocabularyType'));
		const grammarMarkdown = readOptionalText(formData, 'grammarMarkdown');
		const storyImportText = readOptionalText(formData, 'storyImportText');

		if (
			!title ||
			!anchorLessonId ||
			(positionValue !== 'before' && positionValue !== 'after') ||
			!type
		) {
			return fail(400, {
				error: 'Lesson title, type, and placement are required.',
				values: {
					title,
					anchorLessonId,
					position: positionValue,
					type: readText(formData, 'type'),
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? ''
				}
			});
		}

		if (type === 'VOCABULARY' && !vocabularyType) {
			return fail(400, {
				error: 'Vocabulary lessons must have a vocabulary type.',
				values: {
					title,
					anchorLessonId,
					position: positionValue,
					type,
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? ''
				}
			});
		}

		if (type === 'STORY' && storyImportText) {
			const importError = validateStoryImportText(storyImportText);

			if (importError) {
				return fail(400, {
					error: importError,
					values: {
						title,
						anchorLessonId,
						position: positionValue,
						type,
						vocabularyType: readText(formData, 'vocabularyType'),
						grammarMarkdown: grammarMarkdown ?? ''
					}
				});
			}
		}

		let lessonId: string;

		try {
			const lesson = await prisma.$transaction(async (tx) => {
				const anchorLesson = await tx.lesson.findUnique({
					where: { id: anchorLessonId },
					select: { id: true, level: true, lessonOrder: true }
				});

				if (!anchorLesson) {
					throw new Error('Lesson not found.');
				}

				const lessonOrder = getInsertedLessonOrder(anchorLesson.lessonOrder, positionValue);

				await shiftLessonsForInsert(tx, anchorLesson.level, lessonOrder);

				return createLessonRecord(tx, {
					title,
					level: anchorLesson.level,
					lessonOrder,
					type,
					vocabularyType,
					grammarMarkdown,
					storyImportText
				});
			});

			lessonId = lesson.id;
		} catch (error) {
			return fail(400, {
				error:
					error instanceof Error
						? error.message
						: 'Could not create lesson at that position.',
				values: {
					title,
					anchorLessonId,
					position: positionValue,
					type: readText(formData, 'type'),
					vocabularyType: readText(formData, 'vocabularyType'),
					grammarMarkdown: grammarMarkdown ?? ''
				}
			});
		}

		redirect(303, `/lessons/${lessonId}`);
	},
	replaceCefrTargets: async ({ request, locals }) => {
		requireEditor(locals);
		const formData = await request.formData();
		const level = parseCefrLevelValue(readText(formData, 'level'));
		const returnQuery = readText(formData, 'returnQuery');
		const returnSort = parseCefrSortOption(readText(formData, 'returnSort'));
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

		redirect(303, buildLessonsUrl(level, returnQuery, returnSort));
	}
};
