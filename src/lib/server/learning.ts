import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { gradeCard, NEW_CARDS_PER_SESSION } from '$lib/srs';
import type { CefrLevel, Prisma, ReviewGrade } from '@prisma/client';

/**
 * Learner-facing queries and mutations: lesson progression, SRS scheduling,
 * listening practice, and daily activity (XP/streak).
 */

const LESSON_COMPLETE_XP = 20;
const REVIEW_XP = 2;
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

export type LessonState = 'locked' | 'available' | 'in_progress' | 'completed';

export type DashboardLesson = {
	id: string;
	title: string;
	type: 'VOCABULARY' | 'STORY';
	vocabularyType: string | null;
	lessonOrder: number;
	wordCount: number;
	state: LessonState;
	lastStepIndex: number;
};

// ---------------------------------------------------------------------------
// Activity (XP + streak)
// ---------------------------------------------------------------------------

/** Midnight UTC for "today" — LearnActivityDay uses UTC day boundaries. */
function utcToday(now = new Date()): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function recordActivity(
	tx: Prisma.TransactionClient,
	userId: string,
	xp: number,
	now = new Date()
): Promise<void> {
	const date = utcToday(now);
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
	if (days.length === 0) return 0;

	const DAY_MS = 24 * 60 * 60 * 1000;
	const today = utcToday(now).getTime();
	let expected = today;
	if (days[0].date.getTime() !== today) {
		expected = today - DAY_MS;
		if (days[0].date.getTime() !== expected) return 0;
	}

	let streak = 0;
	for (const day of days) {
		if (day.date.getTime() !== expected) break;
		streak += 1;
		expected -= DAY_MS;
	}
	return streak;
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
 * Compute per-lesson unlock states for one level's published lessons, in
 * lessonOrder. A lesson is unlocked when it is the first published lesson of
 * the level or the previous published lesson is completed.
 */
function lessonStates(
	lessons: Array<{ id: string }>,
	progressByLesson: Map<string, { status: string; lastStepIndex: number }>
): Map<string, LessonState> {
	const states = new Map<string, LessonState>();
	let previousCompleted = true;
	for (const lesson of lessons) {
		const progress = progressByLesson.get(lesson.id);
		if (progress?.status === 'COMPLETED') {
			states.set(lesson.id, 'completed');
			previousCompleted = true;
		} else if (previousCompleted) {
			states.set(lesson.id, progress ? 'in_progress' : 'available');
			previousCompleted = false;
		} else {
			states.set(lesson.id, 'locked');
			previousCompleted = false;
		}
	}
	return states;
}

export async function getLearnDashboard(userId: string) {
	const [lessons, progress, dueCount, missedCount, streak, totalXp, questionCounts] =
		await Promise.all([
		prisma.lesson.findMany({
			where: { status: 'PUBLISHED' },
			orderBy: [{ level: 'asc' }, { lessonOrder: 'asc' }],
			select: {
				id: true,
				level: true,
				title: true,
				type: true,
				vocabularyType: true,
				lessonOrder: true,
				sections: { select: { _count: { select: { words: true } } } }
			}
		}),
		prisma.lessonProgress.findMany({
			where: { userId },
			select: { lessonId: true, status: true, lastStepIndex: true }
		}),
		prisma.srsCard.count({
			where: { userId, suspended: false, dueAt: { lte: new Date() } }
		}),
		prisma.missedSentence.count({ where: { userId } }),
		getStreak(userId),
		getTotalXp(userId),
		prisma.clarificationRequest.groupBy({
			by: ['status'],
			where: { userId },
			_count: { _all: true }
		})
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

export async function getPlayableLesson(lessonId: string, userId: string) {
	const lesson = await prisma.lesson.findUnique({
		where: { id: lessonId },
		include: PLAYABLE_LESSON_INCLUDE
	});
	if (!lesson || lesson.status !== 'PUBLISHED') throw error(404, 'Lesson not found');
	await assertLessonUnlocked(lesson, userId);

	const [progress, nextLesson] = await Promise.all([
		prisma.lessonProgress.findUnique({
			where: { userId_lessonId: { userId, lessonId } },
			select: { status: true, lastStepIndex: true }
		}),
		getNextLessonId(lesson)
	]);

	return { lesson, progress, nextLessonId: nextLesson };
}

const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];

async function getNextLessonId(lesson: {
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
		select: { id: true }
	});
	if (sameLevel) return sameLevel.id;

	const laterLevels = CEFR_ORDER.slice(CEFR_ORDER.indexOf(lesson.level) + 1);
	if (laterLevels.length === 0) return null;
	const nextLevel = await prisma.lesson.findFirst({
		where: { status: 'PUBLISHED', level: { in: laterLevels } },
		orderBy: [{ level: 'asc' }, { lessonOrder: 'asc' }],
		select: { id: true }
	});
	return nextLevel?.id ?? null;
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

	const [streak, totalXp, nextLessonId] = await Promise.all([
		getStreak(userId),
		getTotalXp(userId),
		getNextLessonId(lesson)
	]);

	return { newCards, xp: awardedXp, streak, totalXp, nextLessonId };
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

/** Playlist scope: one segment per selected lesson, in course order. */
export async function getPlaylistSegments(lessonIds: string[]): Promise<ListeningSegment[]> {
	if (lessonIds.length === 0) return [];
	const ordered = await prisma.lesson.findMany({
		where: { id: { in: lessonIds }, status: 'PUBLISHED' },
		orderBy: [{ level: 'asc' }, { lessonOrder: 'asc' }],
		select: { id: true, title: true }
	});
	const sentencesByLesson = await sentencesForLessons(ordered.map((lesson) => lesson.id));
	return ordered
		.map((lesson) => ({
			title: lesson.title,
			reps: null,
			sentences: sentencesByLesson.get(lesson.id) ?? []
		}))
		.filter((segment) => segment.sentences.length > 0);
}

// ---------------------------------------------------------------------------
// Glossika-style daily listening program
// ---------------------------------------------------------------------------

export const PROGRAM_PATTERN_MAX_DAYS = 10;
export const PROGRAM_PATTERN_MAX_REPS = 20;

/** Parse "6 4 3 2" into [6, 4, 3, 2]; null when invalid. */
export function parseProgramPattern(raw: string): number[] | null {
	const parts = raw.trim().split(/[\s,]+/).filter(Boolean);
	if (parts.length === 0 || parts.length > PROGRAM_PATTERN_MAX_DAYS) return null;
	const reps = parts.map((part) => Number.parseInt(part, 10));
	if (reps.some((n) => !Number.isFinite(n) || n < 1 || n > PROGRAM_PATTERN_MAX_REPS)) return null;
	return reps;
}

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
	userId: string,
	scope: ListeningScope
): Promise<ListeningSentence[]> {
	if (scope.kind === 'missed') {
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
export async function getListeningPickerData(userId: string) {
	const [lessons, missedCount] = await Promise.all([
		prisma.lesson.findMany({
			where: { status: 'PUBLISHED' },
			orderBy: [{ level: 'asc' }, { lessonOrder: 'asc' }],
			select: {
				id: true,
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
		prisma.missedSentence.count({ where: { userId, sentence: { audioUrl: { not: null } } } })
	]);

	const options = lessons
		.map((lesson) => ({
			id: lesson.id,
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
