import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import type { RequestHandler } from './$types';
import { requireEditor } from '$lib/server/guards';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	requireEditor(locals);
	const body = (await request.json()) as {
		lessonWordId?: string;
		targetId?: string;
		action?: string;
	};
	const { lessonWordId, targetId, action } = body;

	if (!lessonWordId || !targetId || !action) {
		error(400, 'lessonWordId, targetId, and action are required.');
	}

	if (action !== 'add' && action !== 'remove') {
		error(400, 'action must be "add" or "remove".');
	}

	const lessonWord = await prisma.lessonWord.findUnique({
		where: { id: lessonWordId },
		select: {
			id: true,
			lessonSection: { select: { lessonId: true } }
		}
	});

	if (!lessonWord || lessonWord.lessonSection.lessonId !== params.id) {
		error(404, 'Lesson word not found.');
	}

	if (action === 'add') {
		const target = await prisma.cefrEnglishTarget.findUnique({
			where: { id: targetId },
			select: { id: true, coveredByLessonWordId: true }
		});

		if (!target) {
			error(404, 'CEFR target not found.');
		}

		if (target.coveredByLessonWordId && target.coveredByLessonWordId !== lessonWordId) {
			error(409, 'CEFR target is already covered by another lesson word.');
		}

		await prisma.cefrEnglishTarget.update({
			where: { id: targetId },
			data: { coveredByLessonWordId: lessonWordId }
		});
	} else {
		await prisma.cefrEnglishTarget.updateMany({
			where: { id: targetId, coveredByLessonWordId: lessonWordId },
			data: { coveredByLessonWordId: null }
		});
	}

	return json({ ok: true });
};
