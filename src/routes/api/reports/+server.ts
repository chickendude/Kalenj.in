import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { REPORT_ISSUE_TYPES } from '$lib/report-issue-types';
import type { ReportIssueType, ReportTargetType } from '@prisma/client';
import type { RequestHandler } from './$types';

const SUGGESTED_FIX_MAX = 2000;

type Payload = {
	targetType?: unknown;
	targetId?: unknown;
	issueType?: unknown;
	suggestedFix?: unknown;
};

function isIssueType(value: unknown): value is ReportIssueType {
	return typeof value === 'string' && (REPORT_ISSUE_TYPES as string[]).includes(value);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const payload = (await request.json().catch(() => ({}))) as Payload;

	const targetType = payload.targetType;
	const targetId = typeof payload.targetId === 'string' ? payload.targetId.trim() : '';
	const issueType = payload.issueType;
	const suggestedFixRaw =
		typeof payload.suggestedFix === 'string' ? payload.suggestedFix.trim() : '';

	if (targetType !== 'WORD' && targetType !== 'SENTENCE') {
		error(400, 'Invalid target.');
	}
	if (!targetId) {
		error(400, 'Missing target.');
	}
	if (!isIssueType(issueType)) {
		error(400, 'Invalid issue type.');
	}
	if (suggestedFixRaw.length > SUGGESTED_FIX_MAX) {
		error(400, `Suggested fix must be ${SUGGESTED_FIX_MAX} characters or fewer.`);
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

	await prisma.report.create({
		data: {
			targetType: targetType as ReportTargetType,
			wordId: targetType === 'WORD' ? targetId : null,
			sentenceId: targetType === 'SENTENCE' ? targetId : null,
			issueType,
			suggestedFix: suggestedFixRaw || null,
			reporterId: locals.user?.id ?? null
		}
	});

	return json({ ok: true });
};
