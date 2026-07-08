import { fail } from '@sveltejs/kit';
import type { ClarificationStatus, Prisma } from '@prisma/client';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import type { Actions, PageServerLoad } from './$types';

const STATUS_FILTERS = ['open', 'all', 'answered', 'dismissed'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function parseStatusFilter(value: string | null): StatusFilter {
	return STATUS_FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : 'open';
}

function filterToWhere(filter: StatusFilter): Prisma.ClarificationRequestWhereInput {
	if (filter === 'all') return {};
	const status: ClarificationStatus =
		filter === 'open' ? 'OPEN' : filter === 'answered' ? 'ANSWERED' : 'DISMISSED';
	return { status };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	requireEditor(locals);
	const statusFilter = parseStatusFilter(url.searchParams.get('status'));

	const [questions, counts] = await Promise.all([
		prisma.clarificationRequest.findMany({
			where: filterToWhere(statusFilter),
			orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
			take: 200,
			select: {
				id: true,
				targetType: true,
				question: true,
				status: true,
				answer: true,
				createdAt: true,
				answeredAt: true,
				user: { select: { id: true, username: true, displayName: true } },
				answeredBy: { select: { id: true, username: true, displayName: true } },
				word: { select: { id: true, kalenjin: true, slug: true, translations: true } },
				sentence: { select: { id: true, kalenjin: true, english: true } },
				lesson: { select: { id: true, title: true } }
			}
		}),
		prisma.clarificationRequest.groupBy({ by: ['status'], _count: { _all: true } })
	]);

	const countByStatus = new Map(counts.map((row) => [row.status, row._count._all]));
	const open = countByStatus.get('OPEN') ?? 0;
	const answered = countByStatus.get('ANSWERED') ?? 0;
	const dismissed = countByStatus.get('DISMISSED') ?? 0;
	return {
		statusFilter,
		questions,
		statusCounts: { open, answered, dismissed, all: open + answered + dismissed }
	};
};

export const actions: Actions = {
	answer: async ({ request, locals }) => {
		const user = requireEditor(locals);
		const data = await request.formData();
		const questionId = String(data.get('questionId') ?? '').trim();
		const answer = String(data.get('answer') ?? '').trim();
		if (!questionId) return fail(400, { error: 'Missing question.' });
		if (!answer) return fail(400, { error: 'Write an answer first.' });
		if (answer.length > 4000) return fail(400, { error: 'Answers must be 4000 characters or fewer.' });

		await prisma.clarificationRequest.update({
			where: { id: questionId },
			data: {
				answer,
				status: 'ANSWERED',
				answeredById: user.id,
				answeredAt: new Date()
			}
		});
		return { success: 'Answer sent.' };
	},

	dismiss: async ({ request, locals }) => {
		const user = requireEditor(locals);
		const data = await request.formData();
		const questionId = String(data.get('questionId') ?? '').trim();
		if (!questionId) return fail(400, { error: 'Missing question.' });

		await prisma.clarificationRequest.update({
			where: { id: questionId },
			data: { status: 'DISMISSED', answeredById: user.id, answeredAt: new Date() }
		});
		return { success: 'Dismissed.' };
	},

	reopen: async ({ request, locals }) => {
		requireEditor(locals);
		const data = await request.formData();
		const questionId = String(data.get('questionId') ?? '').trim();
		if (!questionId) return fail(400, { error: 'Missing question.' });

		await prisma.clarificationRequest.update({
			where: { id: questionId },
			data: { status: 'OPEN', answeredById: null, answeredAt: null }
		});
		return { success: 'Reopened.' };
	}
};
