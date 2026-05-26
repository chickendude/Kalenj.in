import { fail } from '@sveltejs/kit';
import type { Prisma, ReportStatus } from '@prisma/client';
import { prisma } from '$lib/server/prisma';
import { requireEditor } from '$lib/server/guards';
import type { Actions, PageServerLoad } from './$types';

const STATUS_FILTERS = ['open', 'all', 'resolved', 'dismissed'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function parseStatusFilter(value: string | null): StatusFilter {
	return STATUS_FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : 'open';
}

function filterToWhere(filter: StatusFilter): Prisma.ReportWhereInput {
	if (filter === 'all') return {};
	const status: ReportStatus =
		filter === 'open' ? 'OPEN' : filter === 'resolved' ? 'RESOLVED' : 'DISMISSED';
	return { status };
}

export const load: PageServerLoad = async ({ locals, url }) => {
	requireEditor(locals);
	const statusFilter = parseStatusFilter(url.searchParams.get('status'));

	const [reports, counts] = await Promise.all([
		prisma.report.findMany({
			where: filterToWhere(statusFilter),
			orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
			take: 200,
			select: {
				id: true,
				targetType: true,
				issueType: true,
				suggestedFix: true,
				status: true,
				createdAt: true,
				resolvedAt: true,
				reporter: { select: { id: true, username: true, displayName: true } },
				resolvedBy: { select: { id: true, username: true, displayName: true } },
				word: { select: { id: true, kalenjin: true, translations: true } },
				sentence: { select: { id: true, kalenjin: true, english: true } }
			}
		}),
		prisma.report.groupBy({ by: ['status'], _count: { _all: true } })
	]);

	const countByStatus = new Map(counts.map((row) => [row.status, row._count._all]));
	return {
		statusFilter,
		reports,
		statusCounts: {
			open: countByStatus.get('OPEN') ?? 0,
			resolved: countByStatus.get('RESOLVED') ?? 0,
			dismissed: countByStatus.get('DISMISSED') ?? 0,
			all:
				(countByStatus.get('OPEN') ?? 0) +
				(countByStatus.get('RESOLVED') ?? 0) +
				(countByStatus.get('DISMISSED') ?? 0)
		}
	};
};

async function setStatus(reportId: string, status: ReportStatus, resolverId: string) {
	await prisma.report.update({
		where: { id: reportId },
		data: {
			status,
			resolvedAt: status === 'OPEN' ? null : new Date(),
			resolvedById: status === 'OPEN' ? null : resolverId
		}
	});
}

export const actions: Actions = {
	resolve: async ({ request, locals }) => {
		const user = requireEditor(locals);
		const data = await request.formData();
		const reportId = String(data.get('reportId') ?? '').trim();
		if (!reportId) return fail(400, { error: 'Missing report.' });
		await setStatus(reportId, 'RESOLVED', user.id);
		return { success: 'Marked resolved.' };
	},

	dismiss: async ({ request, locals }) => {
		const user = requireEditor(locals);
		const data = await request.formData();
		const reportId = String(data.get('reportId') ?? '').trim();
		if (!reportId) return fail(400, { error: 'Missing report.' });
		await setStatus(reportId, 'DISMISSED', user.id);
		return { success: 'Dismissed.' };
	},

	reopen: async ({ request, locals }) => {
		const user = requireEditor(locals);
		const data = await request.formData();
		const reportId = String(data.get('reportId') ?? '').trim();
		if (!reportId) return fail(400, { error: 'Missing report.' });
		await setStatus(reportId, 'OPEN', user.id);
		return { success: 'Reopened.' };
	},

	delete: async ({ request, locals }) => {
		requireEditor(locals);
		const data = await request.formData();
		const reportId = String(data.get('reportId') ?? '').trim();
		if (!reportId) return fail(400, { error: 'Missing report.' });
		await prisma.report.delete({ where: { id: reportId } });
		return { success: 'Deleted.' };
	}
};
