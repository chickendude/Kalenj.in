import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { requireUser } from '$lib/server/guards';
import { consumeRateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

const QUESTION_MAX = 2000;
const LIMIT_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

type Payload = {
	targetType?: unknown;
	targetId?: unknown;
	lessonId?: unknown;
	question?: unknown;
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	const payload = (await request.json().catch(() => ({}))) as Payload;

	const targetType = payload.targetType;
	const targetId = typeof payload.targetId === 'string' ? payload.targetId.trim() : '';
	const lessonId = typeof payload.lessonId === 'string' ? payload.lessonId.trim() : '';
	const question = typeof payload.question === 'string' ? payload.question.trim() : '';

	if (targetType !== 'WORD' && targetType !== 'SENTENCE') {
		error(400, 'Invalid target.');
	}
	if (!targetId) error(400, 'Missing target.');
	if (!question) error(400, 'Please write your question.');
	if (question.length > QUESTION_MAX) {
		error(400, `Questions must be ${QUESTION_MAX} characters or fewer.`);
	}

	const rl = consumeRateLimit(`clarification:user:${user.id}`, LIMIT_PER_HOUR, HOUR_MS);
	if (!rl.allowed) {
		return json(
			{ message: 'Too many questions — try again later.' },
			{
				status: 429,
				headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) }
			}
		);
	}

	if (targetType === 'WORD') {
		const exists = await prisma.word.findUnique({ where: { id: targetId }, select: { id: true } });
		if (!exists) error(404, 'Word not found.');
	} else {
		const exists = await prisma.exampleSentence.findUnique({
			where: { id: targetId },
			select: { id: true }
		});
		if (!exists) error(404, 'Sentence not found.');
	}

	if (lessonId) {
		const lesson = await prisma.lesson.findUnique({
			where: { id: lessonId },
			select: { id: true }
		});
		if (!lesson) error(404, 'Lesson not found.');
	}

	await prisma.clarificationRequest.create({
		data: {
			userId: user.id,
			targetType,
			wordId: targetType === 'WORD' ? targetId : null,
			sentenceId: targetType === 'SENTENCE' ? targetId : null,
			lessonId: lessonId || null,
			question
		}
	});

	return json({ ok: true });
};
