import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { parseProgramPattern } from '$lib/learn/listening-program';
import { consumeRateLimit } from '$lib/server/rate-limit';
import { prisma } from '$lib/server/prisma';
import { EASE_MAX, EASE_MIN } from '$lib/srs';
import type { RequestHandler } from './$types';

/**
 * Merge a signed-out learner's locally stored progress (see
 * $lib/learn/local-progress) into their account. Account data always wins:
 * completed lessons are never demoted, existing SRS cards keep their
 * schedule, and an existing listening program is left untouched.
 */

const HOUR_MS = 60 * 60 * 1000;
const MAX_LESSONS = 2000;
const MAX_CARDS = 10_000;
const MAX_ACTIVITY_DAYS = 1500;
const MAX_MISSED = 2000;
const MAX_DAY_XP = 2000;
const MAX_INTERVAL_DAYS = 3650;
const MAX_COUNTER = 10_000;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function asFiniteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asId(value: unknown): string | null {
	return typeof value === 'string' && value.trim() && value.length <= 128 ? value.trim() : null;
}

function asPastDate(value: unknown, now: Date): Date | null {
	if (typeof value !== 'string') return null;
	const time = Date.parse(value);
	if (!Number.isFinite(time)) return null;
	return new Date(Math.min(time, now.getTime()));
}

type ProgressEntry = {
	lessonId: string;
	status: 'IN_PROGRESS' | 'COMPLETED';
	lastStepIndex: number;
	completedAt: Date | null;
};

type CardEntry = {
	wordId: string | null;
	standaloneLessonWordId: string | null;
	contextLessonWordId: string | null;
	ease: number;
	intervalDays: number;
	reps: number;
	lapses: number;
	dueAt: Date;
	lastReviewedAt: Date | null;
};

function sanitizeProgress(raw: unknown, now: Date): ProgressEntry[] {
	if (!raw || typeof raw !== 'object') return [];
	const entries: ProgressEntry[] = [];
	for (const [lessonId, value] of Object.entries(raw as Record<string, unknown>)) {
		if (entries.length >= MAX_LESSONS) break;
		const id = asId(lessonId);
		if (!id || !value || typeof value !== 'object') continue;
		const record = value as Record<string, unknown>;
		const status = record.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
		const lastStepIndex = clamp(Math.floor(asFiniteNumber(record.lastStepIndex) ?? 0), 0, 10_000);
		entries.push({
			lessonId: id,
			status,
			lastStepIndex,
			completedAt: status === 'COMPLETED' ? (asPastDate(record.completedAt, now) ?? now) : null
		});
	}
	return entries;
}

function sanitizeCards(raw: unknown, now: Date): CardEntry[] {
	if (!Array.isArray(raw)) return [];
	const entries: CardEntry[] = [];
	for (const value of raw.slice(0, MAX_CARDS)) {
		if (!value || typeof value !== 'object') continue;
		const record = value as Record<string, unknown>;
		const wordId = asId(record.wordId);
		const standaloneLessonWordId = wordId ? null : asId(record.standaloneLessonWordId);
		if (!wordId && !standaloneLessonWordId) continue;
		entries.push({
			wordId,
			standaloneLessonWordId,
			contextLessonWordId: asId(record.contextLessonWordId),
			ease: clamp(asFiniteNumber(record.ease) ?? 2.5, EASE_MIN, EASE_MAX),
			intervalDays: clamp(asFiniteNumber(record.intervalDays) ?? 0, 0, MAX_INTERVAL_DAYS),
			reps: clamp(Math.floor(asFiniteNumber(record.reps) ?? 0), 0, MAX_COUNTER),
			lapses: clamp(Math.floor(asFiniteNumber(record.lapses) ?? 0), 0, MAX_COUNTER),
			// Future due dates are legitimate (scheduled reviews), just bounded.
			dueAt: (() => {
				const time = typeof record.dueAt === 'string' ? Date.parse(record.dueAt) : NaN;
				if (!Number.isFinite(time)) return now;
				return new Date(clamp(time, 0, now.getTime() + MAX_INTERVAL_DAYS * 24 * HOUR_MS));
			})(),
			lastReviewedAt: asPastDate(record.lastReviewedAt, now)
		});
	}
	return entries;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeActivity(raw: unknown, now: Date): Array<{ date: Date; xp: number }> {
	if (!raw || typeof raw !== 'object') return [];
	const entries: Array<{ date: Date; xp: number }> = [];
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (entries.length >= MAX_ACTIVITY_DAYS) break;
		if (!DAY_KEY.test(key)) continue;
		const time = Date.parse(`${key}T00:00:00.000Z`);
		if (!Number.isFinite(time) || time > now.getTime()) continue;
		const xp = clamp(Math.floor(asFiniteNumber(value) ?? 0), 0, MAX_DAY_XP);
		entries.push({ date: new Date(time), xp });
	}
	return entries;
}

function sanitizeMissed(
	raw: unknown
): Array<{ sentenceId: string; missCount: number }> {
	if (!raw || typeof raw !== 'object') return [];
	const entries: Array<{ sentenceId: string; missCount: number }> = [];
	for (const [sentenceId, value] of Object.entries(raw as Record<string, unknown>)) {
		if (entries.length >= MAX_MISSED) break;
		const id = asId(sentenceId);
		if (!id || !value || typeof value !== 'object') continue;
		const missCount = clamp(
			Math.floor(asFiniteNumber((value as Record<string, unknown>).missCount) ?? 1),
			1,
			1000
		);
		entries.push({ sentenceId: id, missCount });
	}
	return entries;
}

function sanitizeProgram(
	raw: unknown
): { pattern: string; currentDay: number; lessonIds: string[] } | null {
	if (!raw || typeof raw !== 'object') return null;
	const record = raw as Record<string, unknown>;
	const pattern = typeof record.pattern === 'string' ? record.pattern.trim() : '';
	if (!parseProgramPattern(pattern)) return null;
	const lessonIds = Array.isArray(record.lessonIds)
		? record.lessonIds
				.map(asId)
				.filter((id): id is string => !!id)
				.slice(0, 100)
		: [];
	if (lessonIds.length === 0) return null;
	return {
		pattern,
		currentDay: clamp(Math.floor(asFiniteNumber(record.currentDay) ?? 1), 1, 365),
		lessonIds
	};
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);

	const rl = consumeRateLimit(`learn-migrate:user:${user.id}`, 10, HOUR_MS);
	if (!rl.allowed) {
		return json(
			{ message: 'Too many attempts — try again later.' },
			{ status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
		);
	}

	const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!payload) error(400, 'Invalid payload.');

	const now = new Date();
	const progressEntries = sanitizeProgress(payload.lessonProgress, now);
	const cardEntries = sanitizeCards(payload.cards, now);
	const activityEntries = sanitizeActivity(payload.activity, now);
	const missedEntries = sanitizeMissed(payload.missedSentences);
	const program = sanitizeProgram(payload.listeningProgram);

	// Resolve which referenced rows actually exist (and are published, for
	// lesson-scoped data) before writing anything.
	const lessonIds = [
		...new Set([
			...progressEntries.map((entry) => entry.lessonId),
			...(program?.lessonIds ?? [])
		])
	];
	const wordIds = [
		...new Set(cardEntries.map((card) => card.wordId).filter((id): id is string => !!id))
	];
	const lessonWordIds = [
		...new Set(
			cardEntries
				.flatMap((card) => [card.standaloneLessonWordId, card.contextLessonWordId])
				.filter((id): id is string => !!id)
		)
	];
	const sentenceIds = missedEntries.map((entry) => entry.sentenceId);

	const [lessons, words, lessonWords, sentences] = await Promise.all([
		lessonIds.length
			? prisma.lesson.findMany({
					where: { id: { in: lessonIds }, status: 'PUBLISHED' },
					select: { id: true }
				})
			: [],
		wordIds.length
			? prisma.word.findMany({ where: { id: { in: wordIds } }, select: { id: true } })
			: [],
		lessonWordIds.length
			? prisma.lessonWord.findMany({
					where: { id: { in: lessonWordIds }, lessonSection: { lesson: { status: 'PUBLISHED' } } },
					select: { id: true }
				})
			: [],
		sentenceIds.length
			? prisma.exampleSentence.findMany({
					where: { id: { in: sentenceIds } },
					select: { id: true }
				})
			: []
	]);
	const publishedLessonIds = new Set(lessons.map((lesson) => lesson.id));
	const validWordIds = new Set(words.map((word) => word.id));
	const validLessonWordIds = new Set(lessonWords.map((lessonWord) => lessonWord.id));
	const validSentenceIds = new Set(sentences.map((sentence) => sentence.id));

	const validProgress = progressEntries.filter((entry) =>
		publishedLessonIds.has(entry.lessonId)
	);
	const seenCardKeys = new Set<string>();
	const validCards = cardEntries
		.filter((card) =>
			card.wordId
				? validWordIds.has(card.wordId)
				: validLessonWordIds.has(card.standaloneLessonWordId!)
		)
		.filter((card) => {
			const key = card.wordId ? `w:${card.wordId}` : `lw:${card.standaloneLessonWordId}`;
			if (seenCardKeys.has(key)) return false;
			seenCardKeys.add(key);
			return true;
		})
		.map((card) => ({
			...card,
			contextLessonWordId:
				card.contextLessonWordId && validLessonWordIds.has(card.contextLessonWordId)
					? card.contextLessonWordId
					: null
		}));
	const validMissed = missedEntries.filter((entry) => validSentenceIds.has(entry.sentenceId));

	const result = await prisma.$transaction(
		async (tx) => {
			let lessonsMerged = 0;

			const existingProgress = await tx.lessonProgress.findMany({
				where: { userId: user.id, lessonId: { in: validProgress.map((e) => e.lessonId) } },
				select: { lessonId: true, status: true, lastStepIndex: true }
			});
			const existingByLesson = new Map(existingProgress.map((row) => [row.lessonId, row]));

			for (const entry of validProgress) {
				const current = existingByLesson.get(entry.lessonId);
				if (!current) {
					await tx.lessonProgress.create({
						data: {
							userId: user.id,
							lessonId: entry.lessonId,
							status: entry.status,
							lastStepIndex: entry.lastStepIndex,
							completedAt: entry.completedAt
						}
					});
					lessonsMerged += 1;
				} else if (current.status !== 'COMPLETED') {
					if (entry.status === 'COMPLETED') {
						await tx.lessonProgress.update({
							where: { userId_lessonId: { userId: user.id, lessonId: entry.lessonId } },
							data: { status: 'COMPLETED', completedAt: entry.completedAt }
						});
						lessonsMerged += 1;
					} else if (entry.lastStepIndex > current.lastStepIndex) {
						await tx.lessonProgress.update({
							where: { userId_lessonId: { userId: user.id, lessonId: entry.lessonId } },
							data: { lastStepIndex: entry.lastStepIndex }
						});
						lessonsMerged += 1;
					}
				}
			}

			// Existing account cards win — skipDuplicates leaves their schedule alone.
			const createdCards = await tx.srsCard.createMany({
				data: validCards.map((card) => ({ userId: user.id, ...card })),
				skipDuplicates: true
			});

			for (const { date, xp } of activityEntries) {
				await tx.learnActivityDay.upsert({
					where: { userId_date: { userId: user.id, date } },
					create: { userId: user.id, date, xp },
					update: { xp: { increment: xp } }
				});
			}

			for (const { sentenceId, missCount } of validMissed) {
				await tx.missedSentence.upsert({
					where: { userId_sentenceId: { userId: user.id, sentenceId } },
					create: { userId: user.id, sentenceId, missCount },
					update: { missCount: { increment: missCount } }
				});
			}

			let programCreated = false;
			if (program) {
				const existing = await tx.listeningProgram.findUnique({
					where: { userId: user.id },
					select: { id: true }
				});
				const programLessonIds = program.lessonIds.filter((id) => publishedLessonIds.has(id));
				if (!existing && programLessonIds.length > 0) {
					const created = await tx.listeningProgram.create({
						data: { userId: user.id, pattern: program.pattern, currentDay: program.currentDay }
					});
					await tx.listeningProgramLesson.createMany({
						data: programLessonIds.map((lessonId, index) => ({
							programId: created.id,
							lessonId,
							position: index + 1
						}))
					});
					programCreated = true;
				}
			}

			return { lessonsMerged, cardsCreated: createdCards.count, programCreated };
		},
		{ timeout: 20_000 }
	);

	return json({
		ok: true,
		...result,
		activityDays: activityEntries.length,
		missedSentences: validMissed.length
	});
};
