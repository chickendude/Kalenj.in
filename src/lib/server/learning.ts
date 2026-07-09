import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { gradeCard, NEW_CARDS_PER_SESSION } from '$lib/srs';
import { computeStreak, LESSON_COMPLETE_XP, REVIEW_XP, utcDayStart } from '$lib/learn/activity';
import { lessonStates, type LessonState } from '$lib/learn/lesson-states';
import {
	parseProgramPattern,
	PROGRAM_PATTERN_MAX_DAYS,
	PROGRAM_PATTERN_MAX_REPS
} from '$lib/learn/listening-program';
import type { CefrLevel, Prisma, ReviewGrade } from '@prisma/client';

/**
 * Learner-facing queries and mutations: lesson progression, SRS scheduling,
 * listening practice, and daily activity (XP/streak).
 */

export { parseProgramPattern, PROGRAM_PATTERN_MAX_DAYS, PROGRAM_PATTERN_MAX_REPS };
export type { LessonState };

const REVIEW_QUEUE_LIMIT = 50;

const TOKEN_WORD_SELECT = {
	id: true,
	kalenjin: true,
	slug: true,
	translations: true
} satisfies Prisma.WordSelect;

const SENTENCE_INCLUDE = {
	tokens: {
		orderBy: { tokenOrder: 'asc' },
		include: {
			word: { select: TOKEN_WORD_SELECT },
			segments: {
				orderBy: { segmentOrder: 'asc' },
				include: { word: { select: TOKEN_WORD_SELECT } }
			}
		}
	}
} satisfies Prisma.ExampleSentenceInclude;

const LESSON_WORD_INCLUDE = {
	word: {
		include: {
			// Alternative spellings + corpus surface forms let recall drills accept
			// spelling variants (e.g. amitwogik / omitwogik).
			spellings: { select: { spelling: true } },
			observedForms: { select: { normalizedForm: true } }
		}
	},
	sentence: { include: SENTENCE_INCLUDE }
} satisfies Prisma.LessonWordInclude;

const PLAYABLE_LESSON_INCLUDE = {
	sections: {
		orderBy: { sectionOrder: 'asc' },
		include: {
			words: {
				orderBy: { itemOrder: 'asc' },
				include: LESSON_WORD_INCLUDE
			}
		}
	},
	story: {
		include: {
			sentences: {
				orderBy: { sentenceOrder: 'asc' },
				include: { exampleSentence: { include: SENTENCE_INCLUDE } }
			}
		}
	}
} satisfies Prisma.LessonInclude;

export type DashboardLesson = {
	id: string;
	slug: string;
	title: string;
	type: 'VOCABULARY' | 'STORY';
	vocabularyType: string | null;
	lessonOrder: number;
	wordCount: number;
	state: LessonState;
	lastStepIndex: number;
};

/**
 * Learn URLs use lesson slugs; ids keep working as a fallback (matching the
 * dictionary's slug-or-id resolution).
 */
export async function resolveLessonId(segment: string): Promise<string | null> {
	const trimmed = segment.trim();
	if (!trimmed) return null;
	const bySlug = await prisma.lesson.findUnique({
		where: { slug: trimmed.toLowerCase() },
		select: { id: true }
	});
	if (bySlug) return bySlug.id;
	const byId = await prisma.lesson.findUnique({ where: { id: trimmed }, select: { id: true } });
	return byId?.id ?? null;
}

// ---------------------------------------------------------------------------
// Activity (XP + streak)
// ---------------------------------------------------------------------------

async function recordActivity(
	tx: Prisma.TransactionClient,
	userId: string,
	xp: number,
	now = new Date()
): Promise<void> {
	const date = utcDayStart(now);
	await tx.learnActivityDay.upsert({
		where: { userId_date: { userId, date } },
		create: { userId, date, xp },
		update: { xp: { increment: xp } }
	});
}

/**
 * Consecutive-day streak ending today (or yesterday, so the streak isn't
 * shown as broken before the learner has studied today).
 */
async function getStreak(userId: string, now = new Date()): Promise<number> {
	const days = await prisma.learnActivityDay.findMany({
		where: { userId },
		select: { date: true },
		orderBy: { date: 'desc' },
		take: 731
	});
	return computeStreak(days.map((day) => day.date.getTime()), now);
}

async function getTotalXp(userId: string): Promise<number> {
	const result = await prisma.learnActivityDay.aggregate({
		where: { userId },
		_sum: { xp: true }
	});
	return result._sum.xp ?? 0;
}

// ---------------------------------------------------------------------------
// Lesson progression
// ---------------------------------------------------------------------------

/**
 * Learner dashboard. With a null userId (signed out), progress, counts, and
 * activity are all empty — the client overlays its locally stored progress.
 */
export async function getLearnDashboard(userId: string | null) {
	const [lessons, progress, dueCount, missedCount, streak, totalXp, questionCounts] =
		await Promise.all([
		prisma.lesson.findMany({
			where: { status: 'PUBLISHED' },
			orderBy: [{ level: 'asc' }, { lessonOrder: 'asc' }],
			select: {
				id: true,
				slug: true,
				level: true,
				title: true,
				type: true,
				vocabularyType: true,
				lessonOrder: true,
				sections: { select: { _count: { select: { words: true } } } }
			}
		}),
		userId
			? prisma.lessonProgress.findMany({
					where: { userId },
					select: { lessonId: true, status: true, lastStepIndex: true }
				})
			: [],
		userId
			? prisma.srsCard.count({
					where: { userId, suspended: false, dueAt: { lte: new Date() } }
				})
			: 0,
		userId ? prisma.missedSentence.count({ where: { userId } }) : 0,
		userId ? getStreak(userId) : 0,
		userId ? getTotalXp(userId) : 0,
		userId
			? prisma.clarificationRequest.groupBy({
					by: ['status'],
					where: { userId },
					_count: { _all: true }
				})
			: []
	]);

	const questionsByStatus = new Map(questionCounts.map((row) => [row.status, row._count._all]));
	const questionCount =
		(questionsByStatus.get('OPEN') ?? 0) +
		(questionsByStatus.get('ANSWERED') ?? 0) +
		(questionsByStatus.get('DISMISSED') ?? 0);
	const answeredQuestionCount = questionsByStatus.get('ANSWERED') ?? 0;

	const progressByLesson = new Map(
		progress.map((p) => [p.lessonId, { status: p.status, lastStepIndex: p.lastStepIndex }])
	);

	const levels: Array<{ level: string; lessons: DashboardLesson[] }> = [];
	for (const lesson of lessons) {
		let group = levels.at(-1);
		if (!group || group.level !== lesson.level) {
			group = { level: lesson.level, lessons: [] };
			levels.push(group);
		}
		group.lessons.push({
			id: lesson.id,
			slug: lesson.slug,
			title: lesson.title,
			type: lesson.type,
			vocabularyType: lesson.vocabularyType,
			lessonOrder: lesson.lessonOrder,
			wordCount: lesson.sections.reduce((sum, section) => sum + section._count.words, 0),
			state: 'locked',
			lastStepIndex: progressByLesson.get(lesson.id)?.lastStepIndex ?? 0
		});
	}
	for (const group of levels) {
		const states = lessonStates(group.lessons, progressByLesson);
		for (const lesson of group.lessons) {
			lesson.state = states.get(lesson.id) ?? 'locked';
		}
	}

	return { levels, dueCount, missedCount, streak, totalXp, questionCount, answeredQuestionCount };
}

/**
 * Whether the lesson is reachable for this learner (published + previous
 * published lesson in the level completed). Completed lessons stay reachable.
 */
async function assertLessonUnlocked(
	lesson: { id: string; level: CefrLevel; lessonOrder: number },
	userId: string
): Promise<void> {
	const own = await prisma.lessonProgress.findUnique({
		where: { userId_lessonId: { userId, lessonId: lesson.id } },
		select: { status: true }
	});
	if (own?.status === 'COMPLETED') return;

	const previous = await prisma.lesson.findFirst({
		where: {
			level: lesson.level,
			status: 'PUBLISHED',
			lessonOrder: { lt: lesson.lessonOrder }
		},
		orderBy: { lessonOrder: 'desc' },
		select: { id: true }
	});
	if (!previous) return;

	const previousProgress = await prisma.lessonProgress.findUnique({
		where: { userId_lessonId: { userId, lessonId: previous.id } },
		select: { status: true }
	});
	if (previousProgress?.status !== 'COMPLETED') throw error(404, 'Not Found');
}

/**
 * With a null userId (signed out), the unlock check is skipped (progress
 * lives on the client, so the server can't know it) and progress is null.
 */
export async function getPlayableLesson(segment: string, userId: string | null) {
	const lessonId = await resolveLessonId(segment);
	if (!lessonId) throw error(404, 'Lesson not found');
	const lesson = await prisma.lesson.findUnique({
		where: { id: lessonId },
		include: PLAYABLE_LESSON_INCLUDE
	});
	if (!lesson || lesson.status !== 'PUBLISHED') throw error(404, 'Lesson not found');
	if (userId) await assertLessonUnlocked(lesson, userId);

	const [progress, nextLessonSlug] = await Promise.all([
		userId
			? prisma.lessonProgress.findUnique({
					where: { userId_lessonId: { userId, lessonId } },
					select: { status: true, lastStepIndex: true }
				})
			: null,
		getNextLessonSlug(lesson)
	]);

	return { lesson, progress, nextLessonSlug };
}

const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

async function getNextLessonSlug(lesson: {
	id: string;
	level: CefrLevel;
	lessonOrder: number;
}): Promise<string | null> {
	const sameLevel = await prisma.lesson.findFirst({
		where: {
			level: lesson.level,
			status: 'PUBLISHED',
			lessonOrder: { gt: lesson.lessonOrder }
		},
		orderBy: { lessonOrder: 'asc' },
		select: { slug: true }
	});
	if (sameLevel) return sameLevel.slug;

	const laterLevels = CEFR_ORDER.slice(CEFR_ORDER.indexOf(lesson.level) + 1);
	if (laterLevels.length === 0) return null;
	const nextLevel = await prisma.lesson.findFirst({
		where: { status: 'PUBLISHED', level: { in: laterLevels } },
		orderBy: [{ level: 'asc' }, { lessonOrder: 'asc' }],
		select: { slug: true }
	});
	return nextLevel?.slug ?? null;
}

/** Record how far the learner has got; never demotes a COMPLETED lesson. */
export async function upsertLessonStep(
	userId: string,
	lessonId: string,
	stepIndex: number
): Promise<void> {
	const lesson = await prisma.lesson.findUnique({
		where: { id: lessonId },
		select: { status: true }
	});
	if (!lesson || lesson.status !== 'PUBLISHED') throw error(404, 'Lesson not found');

	const existing = await prisma.lessonProgress.findUnique({
		where: { userId_lessonId: { userId, lessonId } },
		select: { status: true }
	});
	if (existing?.status === 'COMPLETED') return;

	await prisma.lessonProgress.upsert({
		where: { userId_lessonId: { userId, lessonId } },
		create: { userId, lessonId, lastStepIndex: stepIndex },
		update: { lastStepIndex: stepIndex }
	});
}

/**
 * Mark the lesson complete, seed SRS cards for its words, and record daily
 * activity — one transaction, idempotent on re-completion.
 */
export async function completeLesson(userId: string, lessonId: string) {
	const lesson = await prisma.lesson.findUnique({
		where: { id: lessonId },
		select: {
			id: true,
			level: true,
			lessonOrder: true,
			status: true,
			sections: { select: { words: { select: { id: true, wordId: true, itemOrder: true } } } }
		}
	});
	if (!lesson || lesson.status !== 'PUBLISHED') throw error(404, 'Lesson not found');
	await assertLessonUnlocked(lesson, userId);

	const lessonWords = lesson.sections.flatMap((section) => section.words);
	const now = new Date();

	const { newCards, awardedXp } = await prisma.$transaction(async (tx) => {
		const existing = await tx.lessonProgress.findUnique({
			where: { userId_lessonId: { userId, lessonId } },
			select: { status: true }
		});
		const firstCompletion = existing?.status !== 'COMPLETED';

		await tx.lessonProgress.upsert({
			where: { userId_lessonId: { userId, lessonId } },
			create: { userId, lessonId, status: 'COMPLETED', completedAt: now },
			update: { status: 'COMPLETED', completedAt: now }
		});

		// Seed cards: one per dictionary word (first introduction wins), one per
		// standalone LessonWord. createMany + skipDuplicates keeps this
		// idempotent for re-completions and words shared across lessons.
		const wordCards = new Map<string, string>();
		const standaloneCards: Array<{ lessonWordId: string }> = [];
		for (const lessonWord of lessonWords) {
			if (lessonWord.wordId) {
				if (!wordCards.has(lessonWord.wordId)) wordCards.set(lessonWord.wordId, lessonWord.id);
			} else {
				standaloneCards.push({ lessonWordId: lessonWord.id });
			}
		}

		const created = await tx.srsCard.createMany({
			data: [
				...[...wordCards.entries()].map(([wordId, contextLessonWordId]) => ({
					userId,
					wordId,
					contextLessonWordId,
					dueAt: now
				})),
				...standaloneCards.map(({ lessonWordId }) => ({
					userId,
					standaloneLessonWordId: lessonWordId,
					contextLessonWordId: lessonWordId,
					dueAt: now
				}))
			],
			skipDuplicates: true
		});

		// Replays don't re-award lesson XP, but still count as daily activity.
		const xp = firstCompletion ? LESSON_COMPLETE_XP : 0;
		await recordActivity(tx, userId, xp, now);
		return { newCards: created.count, awardedXp: xp };
	});

	const [streak, totalXp, nextLessonSlug] = await Promise.all([
		getStreak(userId),
		getTotalXp(userId),
		getNextLessonSlug(lesson)
	]);

	return { newCards, xp: awardedXp, streak, totalXp, nextLessonSlug };
}

// ---------------------------------------------------------------------------
// SRS review
// ---------------------------------------------------------------------------

const DUE_CARD_INCLUDE = {
	word: true,
	standaloneLessonWord: { include: LESSON_WORD_INCLUDE },
	contextLessonWord: { include: LESSON_WORD_INCLUDE }
} satisfies Prisma.SrsCardInclude;

export type DueCard = Prisma.SrsCardGetPayload<{ include: typeof DUE_CARD_INCLUDE }>;

/**
 * Due cards ordered by dueAt, with brand-new (never reviewed) cards capped so
 * a big lesson dump doesn't crowd out scheduled reviews.
 */
export async function getDueCards(userId: string, limit = REVIEW_QUEUE_LIMIT): Promise<DueCard[]> {
	const cards = await prisma.srsCard.findMany({
		where: { userId, suspended: false, dueAt: { lte: new Date() } },
		orderBy: { dueAt: 'asc' },
		take: limit * 2,
		include: DUE_CARD_INCLUDE
	});

	const queue: DueCard[] = [];
	let newCount = 0;
	for (const card of cards) {
		const isNew = card.lastReviewedAt === null;
		if (isNew) {
			if (newCount >= NEW_CARDS_PER_SESSION) continue;
			newCount += 1;
		}
		queue.push(card);
		if (queue.length >= limit) break;
	}
	return queue;
}

export type CardContentRef = {
	wordId?: string | null;
	standaloneLessonWordId?: string | null;
	contextLessonWordId?: string | null;
};

/**
 * Hydrate review-card content (word + lesson-word context) for cards whose
 * SRS state lives on the client (signed-out learners). Only public data:
 * dictionary words and lesson words of published lessons. Entries that no
 * longer resolve come back null so the client can drop stale cards.
 */
export async function getCardContent(refs: CardContentRef[]) {
	const wordIds = [
		...new Set(refs.map((ref) => ref.wordId).filter((id): id is string => !!id))
	];
	const lessonWordIds = [
		...new Set(
			refs
				.flatMap((ref) => [ref.standaloneLessonWordId, ref.contextLessonWordId])
				.filter((id): id is string => !!id)
		)
	];

	const [words, lessonWords] = await Promise.all([
		wordIds.length ? prisma.word.findMany({ where: { id: { in: wordIds } } }) : [],
		lessonWordIds.length
			? prisma.lessonWord.findMany({
					where: {
						id: { in: lessonWordIds },
						lessonSection: { lesson: { status: 'PUBLISHED' } }
					},
					include: LESSON_WORD_INCLUDE
				})
			: []
	]);
	const wordById = new Map(words.map((word) => [word.id, word]));
	const lessonWordById = new Map(lessonWords.map((lessonWord) => [lessonWord.id, lessonWord]));

	return refs.map((ref) => {
		const word = ref.wordId ? (wordById.get(ref.wordId) ?? null) : null;
		const standaloneLessonWord = ref.standaloneLessonWordId
			? (lessonWordById.get(ref.standaloneLessonWordId) ?? null)
			: null;
		const contextLessonWord = ref.contextLessonWordId
			? (lessonWordById.get(ref.contextLessonWordId) ?? null)
			: null;
		if (!word && !standaloneLessonWord) return null;
		return { word, standaloneLessonWord, contextLessonWord };
	});
}

/**
 * Audio-backed sentences by id, in the requested order — used for listening
 * practice over a signed-out learner's locally stored missed sentences.
 */
export async function getSentencesByIds(sentenceIds: string[]): Promise<ListeningSentence[]> {
	if (sentenceIds.length === 0) return [];
	const rows = await prisma.exampleSentence.findMany({
		where: { id: { in: sentenceIds }, audioUrl: { not: null } },
		select: { id: true, kalenjin: true, english: true, audioUrl: true }
	});
	const byId = new Map(rows.map((row) => [row.id, row]));
	return sentenceIds
		.map((id) => byId.get(id))
		.filter((row): row is NonNullable<typeof row> => !!row)
		.map((row) => ({
			id: row.id,
			kalenjin: row.kalenjin,
			english: row.english,
			audioUrl: row.audioUrl!
		}));
}

/**
 * A failed drill inside a lesson: make sure the word has an SRS card and mark
 * it due now (AGAIN) so it comes up for review — without ever advancing the
 * schedule the way a successful review would.
 */
export async function recordDrillMiss(userId: string, lessonWordId: string): Promise<void> {
	const lessonWord = await prisma.lessonWord.findUnique({
		where: { id: lessonWordId },
		select: {
			id: true,
			wordId: true,
			lessonSection: { select: { lesson: { select: { status: true } } } }
		}
	});
	if (!lessonWord || lessonWord.lessonSection.lesson.status !== 'PUBLISHED') {
		throw error(404, 'Not Found');
	}

	const now = new Date();
	await prisma.$transaction(async (tx) => {
		const card = await tx.srsCard.findUnique({
			where: lessonWord.wordId
				? { userId_wordId: { userId, wordId: lessonWord.wordId } }
				: { userId_standaloneLessonWordId: { userId, standaloneLessonWordId: lessonWord.id } }
		});

		if (!card) {
			// New word — seed the card immediately; it's born due, which is
			// exactly what "needs to be reviewed" means.
			await tx.srsCard.create({
				data: {
					userId,
					wordId: lessonWord.wordId,
					standaloneLessonWordId: lessonWord.wordId ? null : lessonWord.id,
					contextLessonWordId: lessonWord.id,
					dueAt: now
				}
			});
			return;
		}

		const next = gradeCard(card, 'AGAIN', now, card.id);
		await tx.srsCard.update({
			where: { id: card.id },
			data: {
				ease: next.ease,
				intervalDays: next.intervalDays,
				reps: next.reps,
				lapses: next.lapses,
				dueAt: next.dueAt
			}
		});
		await tx.reviewLog.create({
			data: {
				userId,
				cardId: card.id,
				grade: 'AGAIN',
				previousIntervalDays: card.intervalDays,
				newIntervalDays: next.intervalDays,
				reviewedAt: now
			}
		});
	});
}

export async function gradeReview(userId: string, cardId: string, grade: ReviewGrade) {
	const now = new Date();
	return prisma.$transaction(async (tx) => {
		const card = await tx.srsCard.findUnique({ where: { id: cardId } });
		if (!card || card.userId !== userId) throw error(404, 'Card not found');

		const next = gradeCard(card, grade, now, card.id);
		await tx.srsCard.update({
			where: { id: cardId },
			data: {
				ease: next.ease,
				intervalDays: next.intervalDays,
				reps: next.reps,
				lapses: next.lapses,
				dueAt: next.dueAt,
				lastReviewedAt: now
			}
		});
		await tx.reviewLog.create({
			data: {
				userId,
				cardId,
				grade,
				previousIntervalDays: card.intervalDays,
				newIntervalDays: next.intervalDays,
				reviewedAt: now
			}
		});
		await recordActivity(tx, userId, REVIEW_XP, now);
		return { dueAt: next.dueAt, intervalDays: next.intervalDays };
	});
}

// ---------------------------------------------------------------------------
// Listening practice
// ---------------------------------------------------------------------------

export type ListeningScope =
	| { kind: 'lesson'; lessonId: string }
	| { kind: 'story'; lessonId: string }
	| { kind: 'missed' };

export type ListeningSentence = {
	id: string;
	kalenjin: string;
	english: string;
	audioUrl: string;
};

/** One lesson's worth of sentences in a listening session. */
export type ListeningSegment = {
	/** Set for per-lesson segments so clients can key segments by lesson. */
	lessonId?: string;
	title: string | null;
	/** Cycle count override (daily program); null → use the session setting. */
	reps: number | null;
	sentences: ListeningSentence[];
};

const MISSED_LIMIT = 100;

/**
 * All audio-backed sentences for one lesson: the example sentences of its
 * words for vocabulary lessons, the story sentences for story lessons.
 */
async function sentencesForLessons(lessonIds: string[]): Promise<Map<string, ListeningSentence[]>> {
	const lessons = await prisma.lesson.findMany({
		where: { id: { in: lessonIds }, status: 'PUBLISHED' },
		select: {
			id: true,
			type: true,
			sections: {
				orderBy: { sectionOrder: 'asc' },
				select: {
					words: {
						orderBy: { itemOrder: 'asc' },
						select: { sentenceTranslation: true, sentence: true }
					}
				}
			},
			story: {
				select: {
					sentences: {
						orderBy: { sentenceOrder: 'asc' },
						select: { exampleSentence: true }
					}
				}
			}
		}
	});

	const bySentenceLesson = new Map<string, ListeningSentence[]>();
	for (const lesson of lessons) {
		const sentences =
			lesson.type === 'STORY'
				? (lesson.story?.sentences ?? [])
						.map(({ exampleSentence }) => exampleSentence)
						.filter((sentence) => sentence.audioUrl)
						.map((sentence) => ({
							id: sentence.id,
							kalenjin: sentence.kalenjin,
							english: sentence.english,
							audioUrl: sentence.audioUrl!
						}))
				: lesson.sections
						.flatMap((section) => section.words)
						.filter((word) => word.sentence?.audioUrl)
						.map((word) => ({
							id: word.sentence!.id,
							kalenjin: word.sentence!.kalenjin,
							english: word.sentenceTranslation?.trim() || word.sentence!.english,
							audioUrl: word.sentence!.audioUrl!
						}));
		bySentenceLesson.set(lesson.id, sentences);
	}
	return bySentenceLesson;
}

/** Playlist scope: one segment per selected lesson (slugs or ids), in course order. */
export async function getPlaylistSegments(lessonSegments: string[]): Promise<ListeningSegment[]> {
	if (lessonSegments.length === 0) return [];
	const ordered = await prisma.lesson.findMany({
		where: {
			OR: [{ id: { in: lessonSegments } }, { slug: { in: lessonSegments } }],
			status: 'PUBLISHED'
		},
		orderBy: [{ level: 'asc' }, { lessonOrder: 'asc' }],
		select: { id: true, title: true }
	});
	const sentencesByLesson = await sentencesForLessons(ordered.map((lesson) => lesson.id));
	return ordered
		.map((lesson) => ({
			lessonId: lesson.id,
			title: lesson.title,
			reps: null,
			sentences: sentencesByLesson.get(lesson.id) ?? []
		}))
		.filter((segment) => segment.sentences.length > 0);
}

// ---------------------------------------------------------------------------
// Glossika-style daily listening program
// ---------------------------------------------------------------------------

export async function getListeningProgram(userId: string) {
	return prisma.listeningProgram.findUnique({
		where: { userId },
		include: {
			lessons: {
				orderBy: { position: 'asc' },
				include: { lesson: { select: { id: true, title: true, type: true, status: true } } }
			}
		}
	});
}

/**
 * Create or replace the user's daily program. Lesson order defines when each
 * lesson is introduced (position N → day N). Keeps the current day unless the
 * program is new or `restart` is set.
 */
export async function saveListeningProgram(
	userId: string,
	lessonIds: string[],
	pattern: number[],
	restart: boolean
): Promise<void> {
	const published = await prisma.lesson.findMany({
		where: { id: { in: lessonIds }, status: 'PUBLISHED' },
		select: { id: true }
	});
	const publishedIds = new Set(published.map((lesson) => lesson.id));
	const ordered = lessonIds.filter((id) => publishedIds.has(id));
	if (ordered.length === 0) throw error(400, 'Pick at least one lesson.');

	await prisma.$transaction(async (tx) => {
		const program = await tx.listeningProgram.upsert({
			where: { userId },
			create: { userId, pattern: pattern.join(' ') },
			update: { pattern: pattern.join(' '), ...(restart ? { currentDay: 1 } : {}) }
		});
		await tx.listeningProgramLesson.deleteMany({ where: { programId: program.id } });
		await tx.listeningProgramLesson.createMany({
			data: ordered.map((lessonId, index) => ({
				programId: program.id,
				lessonId,
				position: index + 1
			}))
		});
	});
}

export type ProgramDaySession = {
	day: number;
	segments: ListeningSegment[];
	/** True once every lesson has aged past the pattern. */
	finished: boolean;
};

/** Build today's session: reviews of older lessons first, new material last. */
export async function getProgramDaySession(userId: string): Promise<ProgramDaySession | null> {
	const program = await getListeningProgram(userId);
	if (!program) return null;
	const pattern = parseProgramPattern(program.pattern) ?? [];

	const active = program.lessons
		.map((entry) => ({
			entry,
			age: program.currentDay - entry.position + 1
		}))
		.filter(
			({ entry, age }) =>
				age >= 1 && age <= pattern.length && entry.lesson.status === 'PUBLISHED'
		);

	const sentencesByLesson = await sentencesForLessons(active.map(({ entry }) => entry.lessonId));
	const segments = active
		.map(({ entry, age }) => ({
			title: `${entry.lesson.title} — day ${age}`,
			reps: pattern[age - 1],
			sentences: sentencesByLesson.get(entry.lessonId) ?? []
		}))
		.filter((segment) => segment.sentences.length > 0);

	const lastActiveDay =
		program.lessons.length === 0 ? 0 : program.lessons.length + pattern.length - 1;
	return {
		day: program.currentDay,
		segments,
		finished: program.currentDay > lastActiveDay
	};
}

export async function advanceListeningProgram(userId: string): Promise<number> {
	const program = await prisma.listeningProgram.findUnique({
		where: { userId },
		select: { id: true, currentDay: true }
	});
	if (!program) throw error(404, 'No listening program.');
	const updated = await prisma.listeningProgram.update({
		where: { id: program.id },
		data: { currentDay: { increment: 1 } },
		select: { currentDay: true }
	});
	return updated.currentDay;
}

export async function getListeningSentences(
	userId: string | null,
	scope: ListeningScope
): Promise<ListeningSentence[]> {
	if (scope.kind === 'missed') {
		if (!userId) return [];
		const missed = await prisma.missedSentence.findMany({
			where: { userId, sentence: { audioUrl: { not: null } } },
			orderBy: [{ missCount: 'desc' }, { updatedAt: 'asc' }],
			take: MISSED_LIMIT,
			include: { sentence: true }
		});
		return missed.map(({ sentence }) => ({
			id: sentence.id,
			kalenjin: sentence.kalenjin,
			english: sentence.english,
			audioUrl: sentence.audioUrl!
		}));
	}

	if (scope.kind === 'story') {
		const lesson = await prisma.lesson.findUnique({
			where: { id: scope.lessonId },
			select: {
				status: true,
				story: {
					select: {
						sentences: {
							orderBy: { sentenceOrder: 'asc' },
							select: { exampleSentence: true }
						}
					}
				}
			}
		});
		if (!lesson || lesson.status !== 'PUBLISHED') throw error(404, 'Lesson not found');
		return (lesson.story?.sentences ?? [])
			.map(({ exampleSentence }) => exampleSentence)
			.filter((sentence) => sentence.audioUrl)
			.map((sentence) => ({
				id: sentence.id,
				kalenjin: sentence.kalenjin,
				english: sentence.english,
				audioUrl: sentence.audioUrl!
			}));
	}

	const lesson = await prisma.lesson.findUnique({
		where: { id: scope.lessonId },
		select: {
			status: true,
			sections: {
				orderBy: { sectionOrder: 'asc' },
				select: {
					words: {
						orderBy: { itemOrder: 'asc' },
						select: { sentenceTranslation: true, sentence: true }
					}
				}
			}
		}
	});
	if (!lesson || lesson.status !== 'PUBLISHED') throw error(404, 'Lesson not found');
	return lesson.sections
		.flatMap((section) => section.words)
		.filter((word) => word.sentence?.audioUrl)
		.map((word) => ({
			id: word.sentence!.id,
			kalenjin: word.sentence!.kalenjin,
			english: word.sentenceTranslation?.trim() || word.sentence!.english,
			audioUrl: word.sentence!.audioUrl!
		}));
}

/**
 * Options for the listening-mode scope picker: published lessons that have at
 * least one sentence with audio, plus the learner's missed-sentence count.
 */
export async function getListeningPickerData(userId: string | null) {
	const [lessons, missedCount] = await Promise.all([
		prisma.lesson.findMany({
			where: { status: 'PUBLISHED' },
			orderBy: [{ level: 'asc' }, { lessonOrder: 'asc' }],
			select: {
				id: true,
				slug: true,
				level: true,
				title: true,
				type: true,
				sections: {
					select: { words: { select: { sentence: { select: { audioUrl: true } } } } }
				},
				story: {
					select: { sentences: { select: { exampleSentence: { select: { audioUrl: true } } } } }
				}
			}
		}),
		userId
			? prisma.missedSentence.count({
					where: { userId, sentence: { audioUrl: { not: null } } }
				})
			: 0
	]);

	const options = lessons
		.map((lesson) => ({
			id: lesson.id,
			slug: lesson.slug,
			level: lesson.level,
			title: lesson.title,
			type: lesson.type,
			audioCount:
				lesson.type === 'STORY'
					? (lesson.story?.sentences ?? []).filter((s) => s.exampleSentence.audioUrl).length
					: lesson.sections
							.flatMap((section) => section.words)
							.filter((word) => word.sentence?.audioUrl).length
		}))
		.filter((option) => option.audioCount > 0);

	return { options, missedCount };
}

export async function setSentenceMissed(
	userId: string,
	sentenceId: string,
	missed: boolean
): Promise<void> {
	if (missed) {
		await prisma.missedSentence.upsert({
			where: { userId_sentenceId: { userId, sentenceId } },
			create: { userId, sentenceId },
			update: { missCount: { increment: 1 } }
		});
	} else {
		await prisma.missedSentence.deleteMany({ where: { userId, sentenceId } });
	}
}
