import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import {
	getListeningPickerData,
	getListeningProgram,
	getListeningSentences,
	getPlaylistSegments,
	getProgramDaySession,
	parseProgramPattern,
	resolveLessonId,
	saveListeningProgram,
	type ListeningScope,
	type ListeningSegment
} from '$lib/server/learning';
import { prisma } from '$lib/server/prisma';
import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const MIN_REPS = 1;
const MAX_REPS = 9;
const MAX_KALENJIN_REPS = 2;
const REPS_COOKIE = 'listen_reps';

export type ListenSettings = {
	reps: number;
	kalenjinReps: number;
	shuffle: boolean;
};

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
	const parsed = Number.parseInt(raw ?? '', 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(max, Math.max(min, parsed));
}

function readSettings(url: URL, storedReps: string | null): ListenSettings {
	return {
		reps: clampInt(url.searchParams.get('reps') ?? storedReps, 3, MIN_REPS, MAX_REPS),
		kalenjinReps: clampInt(url.searchParams.get('kreps'), 1, 1, MAX_KALENJIN_REPS),
		shuffle: url.searchParams.get('shuffle') === '1'
	};
}

export const load: PageServerLoad = async ({ cookies, locals, url }) => {
	const userId = locals.user?.id ?? null;
	const scopeParam = url.searchParams.get('scope');
	const settings = readSettings(url, cookies.get(REPS_COOKIE) ?? null);
	if (url.searchParams.has('reps')) {
		cookies.set(REPS_COOKIE, String(settings.reps), {
			path: '/learn/listen',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 365
		});
	}

	if (scopeParam === 'missed') {
		// Signed out: missed sentences live in localStorage — the client
		// hydrates them via /api/learn/sentences.
		const sentences = userId ? await getListeningSentences(userId, { kind: 'missed' }) : [];
		const segments: ListeningSegment[] = [{ title: null, reps: null, sentences }];
		return {
			mode: 'play' as const,
			scope: 'missed' as const,
			title: 'Problem sentences',
			segments,
			settings
		};
	}

	if (scopeParam === 'lesson' || scopeParam === 'story') {
		const segment = url.searchParams.get('lessonId')?.trim() ?? '';
		if (!segment) error(400, 'Missing lesson.');
		const lessonId = await resolveLessonId(segment);
		if (!lessonId) error(404, 'Lesson not found.');
		const scope: ListeningScope = { kind: scopeParam, lessonId };
		const [sentences, lesson] = await Promise.all([
			getListeningSentences(userId, scope),
			prisma.lesson.findUnique({ where: { id: lessonId }, select: { title: true } })
		]);
		const segments: ListeningSegment[] = [{ title: null, reps: null, sentences }];
		return {
			mode: 'play' as const,
			scope: scopeParam,
			title: lesson?.title ?? 'Speaking Drills',
			segments,
			settings
		};
	}

	if (scopeParam === 'playlist') {
		const lessonIds = (url.searchParams.get('lessonIds') ?? '')
			.split(',')
			.map((id) => id.trim())
			.filter(Boolean)
			.slice(0, 50);
		if (lessonIds.length === 0) error(400, 'Pick at least one lesson.');
		const segments = await getPlaylistSegments(lessonIds);
		return {
			mode: 'play' as const,
			scope: 'playlist' as const,
			title: `Playlist — ${segments.length} ${segments.length === 1 ? 'lesson' : 'lessons'}`,
			segments,
			settings
		};
	}

	if (scopeParam === 'program') {
		// Signed out: the program lives in localStorage — the client builds
		// today's session via /api/learn/listening-segments.
		if (!userId) {
			return {
				mode: 'play' as const,
				scope: 'program' as const,
				title: 'Daily program',
				segments: [] as ListeningSegment[],
				programFinished: false,
				settings
			};
		}
		const session = await getProgramDaySession(userId);
		if (!session) error(404, 'No listening program set up yet.');
		return {
			mode: 'play' as const,
			scope: 'program' as const,
			title: `Daily program — day ${session.day}`,
			segments: session.segments,
			programFinished: session.finished,
			settings
		};
	}

	const [picker, program, programSession] = await Promise.all([
		getListeningPickerData(userId),
		userId ? getListeningProgram(userId) : null,
		userId ? getProgramDaySession(userId) : null
	]);
	const publishedOptionIds = new Set(picker.options.map((option) => option.id));
	const programLessons = program
		? program.lessons.filter((entry) => publishedOptionIds.has(entry.lessonId))
		: [];

	return {
		mode: 'pick' as const,
		settings,
		...picker,
		program: program
			? {
					pattern: program.pattern,
					day: program.currentDay,
					lessonIds: programLessons.map((entry) => entry.lessonId),
					lessonTitles: programLessons.map((entry) => entry.lesson.title),
					todaySentenceCount:
						programSession?.segments.reduce((sum, s) => sum + s.sentences.length, 0) ?? 0,
					todayRepetitions: programSession?.segments.map((s) => s.reps ?? 1) ?? [],
					finished: programSession?.finished ?? false
				}
			: null
	};
};

export const actions: Actions = {
	saveProgram: async ({ request, locals }) => {
		const user = requireUser(locals);
		const data = await request.formData();
		const patternRaw = String(data.get('pattern') ?? '');
		const lessonIds = data
			.getAll('lessonIds')
			.map((value) => String(value).trim())
			.filter(Boolean)
			.slice(0, 100);
		const restart = data.get('restart') === 'on';

		const pattern = parseProgramPattern(patternRaw);
		if (!pattern) {
			return fail(400, {
				error: 'Pattern must be 1–10 numbers between 1 and 20, e.g. "6 4 3 2".'
			});
		}
		if (lessonIds.length === 0) {
			return fail(400, { error: 'Pick at least one lesson for the program.' });
		}

		await saveListeningProgram(user.id, lessonIds, pattern, restart);
		return { success: 'Program saved.' };
	},

	deleteProgram: async ({ locals }) => {
		const user = requireUser(locals);
		await prisma.listeningProgram.deleteMany({ where: { userId: user.id } });
		return { success: 'Program removed.' };
	}
};
