import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { REPORT_ISSUE_TYPES } from '$lib/report-issue-types';
import { consumeRateLimit } from '$lib/server/rate-limit';
import type { ReportIssueType, ReportTargetType } from '@prisma/client';
import type { RequestHandler } from './$types';

const SUGGESTED_FIX_MAX = 2000;

// Anonymous reports get a tighter limit since the only identifier is IP.
// Signed-in reports get more headroom; abuse there is easier to remediate
// because we can disable the account.
const ANON_LIMIT_PER_HOUR = 10;
const USER_LIMIT_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;

type Payload = {
	targetType?: unknown;
	targetId?: unknown;
	issueType?: unknown;
	suggestedFix?: unknown;
};

function isIssueType(value: unknown): value is ReportIssueType {
	return typeof value === 'string' && (REPORT_ISSUE_TYPES as string[]).includes(value);
}

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
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

	// Rate-limit by user-id when signed in, otherwise by client IP. This is
	// in-memory and per-process; if we ever run multiple app nodes this needs
	// to move to a shared store (Redis or a DB-backed bucket).
	const userId = locals.user?.id ?? null;
	const limitKey = userId ? `report:user:${userId}` : `report:ip:${getClientAddress()}`;
	const limitMax = userId ? USER_LIMIT_PER_HOUR : ANON_LIMIT_PER_HOUR;
	const rl = consumeRateLimit(limitKey, limitMax, HOUR_MS);
	if (!rl.allowed) {
		return json(
			{ message: 'Too many reports — try again later.' },
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

	// Duplicate suppression: if there's already an OPEN report on the same
	// target with the same issue type, return success without creating noise
	// in the admin queue. We treat this as idempotent on the client's side —
	// they get the same "thanks" toast either way. If the previous report had
	// no suggested fix and this one does, attach the fix to the existing row
	// so editors don't miss the new information.
	const existingOpen = await prisma.report.findFirst({
		where: {
			status: 'OPEN',
			issueType,
			...(targetType === 'WORD' ? { wordId: targetId } : { sentenceId: targetId })
		},
		select: { id: true, suggestedFix: true }
	});

	if (existingOpen) {
		if (!existingOpen.suggestedFix && suggestedFixRaw) {
			await prisma.report.update({
				where: { id: existingOpen.id },
				data: { suggestedFix: suggestedFixRaw }
			});
		}
		return json({ ok: true, deduped: true });
	}

	await prisma.report.create({
		data: {
			targetType: targetType as ReportTargetType,
			wordId: targetType === 'WORD' ? targetId : null,
			sentenceId: targetType === 'SENTENCE' ? targetId : null,
			issueType,
			suggestedFix: suggestedFixRaw || null,
			reporterId: userId
		}
	});

	return json({ ok: true });
};
