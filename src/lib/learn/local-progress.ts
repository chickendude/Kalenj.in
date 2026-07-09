import { gradeCard, NEW_CARDS_PER_SESSION, type SrsNextState } from '$lib/srs';
import type { ReviewGrade } from '@prisma/client';
import { computeStreak, LESSON_COMPLETE_XP, REVIEW_XP, utcDayStart } from './activity';

/**
 * Signed-out learning progress, persisted in localStorage. Mirrors the
 * server's Prisma-backed semantics (lesson progression, SRS scheduling, daily
 * XP/streak, missed sentences, listening program) so the data can be merged
 * into an account later via POST /api/learn/migrate.
 *
 * The `apply*` functions are pure over a LocalLearnData object (unit
 * testable); the `local*` wrappers load, mutate, and persist.
 */

export const LOCAL_LEARN_KEY = 'kalenjin.learn.v1';

export type LocalLessonProgress = {
	status: 'IN_PROGRESS' | 'COMPLETED';
	lastStepIndex: number;
	completedAt: string | null;
};

export type LocalSrsCard = {
	/** Stable local id — also seeds the deterministic interval fuzz. */
	id: string;
	wordId: string | null;
	standaloneLessonWordId: string | null;
	contextLessonWordId: string | null;
	ease: number;
	intervalDays: number;
	reps: number;
	lapses: number;
	dueAt: string;
	lastReviewedAt: string | null;
};

export type LocalListeningProgram = {
	pattern: string;
	currentDay: number;
	lessonIds: string[];
};

export type LocalLearnData = {
	version: 1;
	lessonProgress: Record<string, LocalLessonProgress>;
	cards: LocalSrsCard[];
	/** UTC day (YYYY-MM-DD) → XP earned that day. */
	activity: Record<string, number>;
	missedSentences: Record<string, { missCount: number; updatedAt: string }>;
	listeningProgram: LocalListeningProgram | null;
};

export function emptyLocalData(): LocalLearnData {
	return {
		version: 1,
		lessonProgress: {},
		cards: [],
		activity: {},
		missedSentences: {},
		listeningProgram: null
	};
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function storage(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

export function loadLocalLearnData(): LocalLearnData {
	const raw = storage()?.getItem(LOCAL_LEARN_KEY);
	if (!raw) return emptyLocalData();
	try {
		const parsed = JSON.parse(raw) as Partial<LocalLearnData> | null;
		if (!parsed || parsed.version !== 1) return emptyLocalData();
		return {
			version: 1,
			lessonProgress: parsed.lessonProgress ?? {},
			cards: Array.isArray(parsed.cards) ? parsed.cards : [],
			activity: parsed.activity ?? {},
			missedSentences: parsed.missedSentences ?? {},
			listeningProgram: parsed.listeningProgram ?? null
		};
	} catch {
		return emptyLocalData();
	}
}

function saveLocalLearnData(data: LocalLearnData): void {
	try {
		storage()?.setItem(LOCAL_LEARN_KEY, JSON.stringify(data));
	} catch {
		// Quota/private-mode failures: progress simply isn't persisted.
	}
}

export function hasLocalLearnData(): boolean {
	return storage()?.getItem(LOCAL_LEARN_KEY) != null;
}

export function clearLocalLearnData(): void {
	storage()?.removeItem(LOCAL_LEARN_KEY);
}

function mutate<T>(fn: (data: LocalLearnData) => T): T {
	const data = loadLocalLearnData();
	const result = fn(data);
	saveLocalLearnData(data);
	return result;
}

// ---------------------------------------------------------------------------
// Activity (XP + streak)
// ---------------------------------------------------------------------------

function utcDayKey(now: Date): string {
	return utcDayStart(now).toISOString().slice(0, 10);
}

export function applyActivity(data: LocalLearnData, xp: number, now: Date): void {
	const key = utcDayKey(now);
	data.activity[key] = (data.activity[key] ?? 0) + xp;
}

export function localStreakOf(data: LocalLearnData, now = new Date()): number {
	const dayTimes = Object.keys(data.activity)
		.map((key) => Date.parse(`${key}T00:00:00.000Z`))
		.filter((time) => Number.isFinite(time))
		.sort((a, b) => b - a);
	return computeStreak(dayTimes, now);
}

export function localTotalXpOf(data: LocalLearnData): number {
	return Object.values(data.activity).reduce((sum, xp) => sum + xp, 0);
}

// ---------------------------------------------------------------------------
// Lesson progression
// ---------------------------------------------------------------------------

export function applyLessonStep(data: LocalLearnData, lessonId: string, stepIndex: number): void {
	const existing = data.lessonProgress[lessonId];
	if (existing?.status === 'COMPLETED') return;
	data.lessonProgress[lessonId] = {
		status: 'IN_PROGRESS',
		lastStepIndex: stepIndex,
		completedAt: null
	};
}

export type CompletableLesson = {
	id: string;
	sections: Array<{ words: Array<{ id: string; wordId?: string | null }> }>;
};

function cardId(wordId: string | null, lessonWordId: string): string {
	return wordId ? `local-w:${wordId}` : `local-lw:${lessonWordId}`;
}

/**
 * Mark the lesson complete, seed SRS cards for its words (first introduction
 * wins; idempotent on re-completion), and record daily activity.
 */
export function applyLessonComplete(
	data: LocalLearnData,
	lesson: CompletableLesson,
	now = new Date()
): { newCards: number; xp: number } {
	const firstCompletion = data.lessonProgress[lesson.id]?.status !== 'COMPLETED';
	data.lessonProgress[lesson.id] = {
		status: 'COMPLETED',
		lastStepIndex: data.lessonProgress[lesson.id]?.lastStepIndex ?? 0,
		completedAt: now.toISOString()
	};

	const existingIds = new Set(data.cards.map((card) => card.id));
	let newCards = 0;
	for (const lessonWord of lesson.sections.flatMap((section) => section.words)) {
		const id = cardId(lessonWord.wordId ?? null, lessonWord.id);
		if (existingIds.has(id)) continue;
		existingIds.add(id);
		newCards += 1;
		data.cards.push({
			id,
			wordId: lessonWord.wordId ?? null,
			standaloneLessonWordId: lessonWord.wordId ? null : lessonWord.id,
			contextLessonWordId: lessonWord.id,
			ease: 2.5,
			intervalDays: 0,
			reps: 0,
			lapses: 0,
			dueAt: now.toISOString(),
			lastReviewedAt: null
		});
	}

	// Replays don't re-award lesson XP, but still count as daily activity.
	const xp = firstCompletion ? LESSON_COMPLETE_XP : 0;
	applyActivity(data, xp, now);
	return { newCards, xp };
}

/**
 * A failed drill inside a lesson: make sure the word has an SRS card and mark
 * it due now (AGAIN) — without ever advancing the schedule.
 */
export function applyDrillMiss(
	data: LocalLearnData,
	lessonWord: { id: string; wordId?: string | null },
	now = new Date()
): void {
	const id = cardId(lessonWord.wordId ?? null, lessonWord.id);
	const card = data.cards.find((candidate) => candidate.id === id);
	if (!card) {
		// New word — the card is born due, which is exactly what "needs to be
		// reviewed" means.
		data.cards.push({
			id,
			wordId: lessonWord.wordId ?? null,
			standaloneLessonWordId: lessonWord.wordId ? null : lessonWord.id,
			contextLessonWordId: lessonWord.id,
			ease: 2.5,
			intervalDays: 0,
			reps: 0,
			lapses: 0,
			dueAt: now.toISOString(),
			lastReviewedAt: null
		});
		return;
	}
	const next = gradeCard(toSrsState(card), 'AGAIN', now, card.id);
	assignNextState(card, next);
}

// ---------------------------------------------------------------------------
// SRS review
// ---------------------------------------------------------------------------

const REVIEW_QUEUE_LIMIT = 50;

function toSrsState(card: LocalSrsCard) {
	return {
		ease: card.ease,
		intervalDays: card.intervalDays,
		reps: card.reps,
		lapses: card.lapses
	};
}

function assignNextState(card: LocalSrsCard, next: SrsNextState): void {
	card.ease = next.ease;
	card.intervalDays = next.intervalDays;
	card.reps = next.reps;
	card.lapses = next.lapses;
	card.dueAt = next.dueAt.toISOString();
}

export function dueCardCount(data: LocalLearnData, now = new Date()): number {
	const cutoff = now.toISOString();
	return data.cards.filter((card) => card.dueAt <= cutoff).length;
}

/**
 * Due cards ordered by dueAt, with brand-new (never reviewed) cards capped so
 * a big lesson dump doesn't crowd out scheduled reviews.
 */
export function dueLocalCards(
	data: LocalLearnData,
	now = new Date(),
	limit = REVIEW_QUEUE_LIMIT
): LocalSrsCard[] {
	const cutoff = now.toISOString();
	const due = data.cards
		.filter((card) => card.dueAt <= cutoff)
		.sort((a, b) => a.dueAt.localeCompare(b.dueAt));

	const queue: LocalSrsCard[] = [];
	let newCount = 0;
	for (const card of due) {
		if (card.lastReviewedAt === null) {
			if (newCount >= NEW_CARDS_PER_SESSION) continue;
			newCount += 1;
		}
		queue.push(card);
		if (queue.length >= limit) break;
	}
	return queue;
}

export function applyReviewGrade(
	data: LocalLearnData,
	cardId: string,
	grade: ReviewGrade,
	now = new Date()
): boolean {
	const card = data.cards.find((candidate) => candidate.id === cardId);
	if (!card) return false;
	const next = gradeCard(toSrsState(card), grade, now, card.id);
	assignNextState(card, next);
	card.lastReviewedAt = now.toISOString();
	applyActivity(data, REVIEW_XP, now);
	return true;
}

// ---------------------------------------------------------------------------
// Missed sentences (listening practice)
// ---------------------------------------------------------------------------

export function applySentenceMissed(
	data: LocalLearnData,
	sentenceId: string,
	missed: boolean,
	now = new Date()
): void {
	if (missed) {
		const existing = data.missedSentences[sentenceId];
		data.missedSentences[sentenceId] = {
			missCount: (existing?.missCount ?? 0) + 1,
			updatedAt: now.toISOString()
		};
	} else {
		delete data.missedSentences[sentenceId];
	}
}

/** Sentence ids ordered like the server's missed queue: missCount desc, then oldest first. */
export function missedSentenceIds(data: LocalLearnData, limit = 100): string[] {
	return Object.entries(data.missedSentences)
		.sort(([, a], [, b]) => b.missCount - a.missCount || a.updatedAt.localeCompare(b.updatedAt))
		.slice(0, limit)
		.map(([sentenceId]) => sentenceId);
}

// ---------------------------------------------------------------------------
// Store-level wrappers (load → mutate → persist)
// ---------------------------------------------------------------------------

export function localLessonProgressMap(): Map<
	string,
	{ status: string; lastStepIndex: number }
> {
	const data = loadLocalLearnData();
	return new Map(
		Object.entries(data.lessonProgress).map(([lessonId, progress]) => [
			lessonId,
			{ status: progress.status, lastStepIndex: progress.lastStepIndex }
		])
	);
}

export function localLessonProgress(lessonId: string): LocalLessonProgress | null {
	return loadLocalLearnData().lessonProgress[lessonId] ?? null;
}

export function localUpsertLessonStep(lessonId: string, stepIndex: number): void {
	mutate((data) => applyLessonStep(data, lessonId, stepIndex));
}

export function localCompleteLesson(lesson: CompletableLesson): {
	newCards: number;
	xp: number;
	streak: number;
	totalXp: number;
} {
	return mutate((data) => {
		const { newCards, xp } = applyLessonComplete(data, lesson);
		return { newCards, xp, streak: localStreakOf(data), totalXp: localTotalXpOf(data) };
	});
}

export function localRecordDrillMiss(lessonWord: { id: string; wordId?: string | null }): void {
	mutate((data) => applyDrillMiss(data, lessonWord));
}

export function localDueCards(limit = REVIEW_QUEUE_LIMIT): LocalSrsCard[] {
	return dueLocalCards(loadLocalLearnData(), new Date(), limit);
}

export function localGradeReview(cardId: string, grade: ReviewGrade): void {
	mutate((data) => applyReviewGrade(data, cardId, grade));
}

export function localSetSentenceMissed(sentenceId: string, missed: boolean): void {
	mutate((data) => applySentenceMissed(data, sentenceId, missed));
}

export function localMissedSentenceIds(): string[] {
	return missedSentenceIds(loadLocalLearnData());
}

export function localDashboardStats(): {
	dueCount: number;
	missedCount: number;
	streak: number;
	totalXp: number;
} {
	const data = loadLocalLearnData();
	return {
		// Uncapped, matching the server dashboard's due count.
		dueCount: dueCardCount(data),
		missedCount: Object.keys(data.missedSentences).length,
		streak: localStreakOf(data),
		totalXp: localTotalXpOf(data)
	};
}

export function localListeningProgram(): LocalListeningProgram | null {
	return loadLocalLearnData().listeningProgram;
}

export function localSaveListeningProgram(
	pattern: string,
	lessonIds: string[],
	restart: boolean
): void {
	mutate((data) => {
		data.listeningProgram = {
			pattern,
			currentDay: restart || !data.listeningProgram ? 1 : data.listeningProgram.currentDay,
			lessonIds
		};
	});
}

export function localDeleteListeningProgram(): void {
	mutate((data) => {
		data.listeningProgram = null;
	});
}

export function localAdvanceListeningProgram(): number {
	return mutate((data) => {
		if (!data.listeningProgram) return 1;
		data.listeningProgram.currentDay += 1;
		return data.listeningProgram.currentDay;
	});
}
