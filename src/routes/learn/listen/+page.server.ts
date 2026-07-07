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
const MAX_KALENJIN_REPS = 3;

export type ListenSettings = {
	reps: number;
	kalenjinReps: number;
	shuffle: boolean;
	englishAudio: boolean;
};

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
	const parsed = Number.parseInt(raw ?? '', 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(max, Math.max(min, parsed));
}

function readSettings(url: URL): ListenSettings {
	return {
		reps: clampInt(url.searchParams.get('reps'), 2, MIN_REPS, MAX_REPS),
		kalenjinReps: clampInt(url.searchParams.get('kreps'), 1, 1, MAX_KALENJIN_REPS),
		shuffle: url.searchParams.get('shuffle') === '1',
		englishAudio: url.searchParams.get('english') !== '0'
	};
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	const scopeParam = url.searchParams.get('scope');
	const settings = readSettings(url);

	if (scopeParam === 'missed') {
		const sentences = await getListeningSentences(user.id, { kind: 'missed' });
		const segments: ListeningSegment[] = [{ title: null, reps: null, sentences }];
		return {
			mode: 'play' as const,
			scope: 'missed' as const,
			title: 'Sentences you missed',
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
			getListeningSentences(user.id, scope),
			prisma.lesson.findUnique({ where: { id: lessonId }, select: { title: true } })
		]);
		const segments: ListeningSegment[] = [{ title: null, reps: null, sentences }];
		return {
			mode: 'play' as const,
			scope: scopeParam,
			title: lesson?.title ?? 'Listening practice',
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
		const session = await getProgramDaySession(user.id);
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
		getListeningPickerData(user.id),
		getListeningProgram(user.id),
		getProgramDaySession(user.id)
	]);

	return {
		mode: 'pick' as const,
		settings,
		...picker,
		program: program
			? {
					pattern: program.pattern,
					day: program.currentDay,
					lessonIds: program.lessons.map((entry) => entry.lessonId),
					lessonTitles: program.lessons.map((entry) => entry.lesson.title),
					todaySentenceCount:
						programSession?.segments.reduce((sum, s) => sum + s.sentences.length, 0) ?? 0,
					todayCycles: programSession?.segments.map((s) => s.reps ?? 1) ?? [],
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
