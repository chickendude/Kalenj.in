import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guards';
import { gradeReview } from '$lib/server/learning';
import type { ReviewGrade } from '@prisma/client';
import type { RequestHandler } from './$types';

const GRADES: ReviewGrade[] = ['AGAIN', 'HARD', 'GOOD', 'EASY'];

type Payload = {
	cardId?: unknown;
	grade?: unknown;
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	const payload = (await request.json().catch(() => ({}))) as Payload;

	const cardId = typeof payload.cardId === 'string' ? payload.cardId.trim() : '';
	const grade = payload.grade;

	if (!cardId) error(400, 'Missing card.');
	if (typeof grade !== 'string' || !(GRADES as string[]).includes(grade)) {
		error(400, 'Invalid grade.');
	}

	const result = await gradeReview(user.id, cardId, grade as ReviewGrade);
	return json(result);
};
