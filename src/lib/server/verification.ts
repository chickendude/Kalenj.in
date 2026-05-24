import { randomBytes } from 'node:crypto';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { prisma } from './prisma';
import { sendEmail } from './email';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const RESEND_DAILY_CAP = 5;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Build verification links from a trusted public origin. ORIGIN env var (also
 * used by @sveltejs/adapter-node for CSRF) is the source of truth in
 * production — otherwise a forged Host header could point recipients at an
 * attacker-controlled domain. In dev we fall back to the request's own origin
 * so local iteration keeps working without extra setup.
 */
function publicOrigin(requestOrigin: string): string {
	const configured = env.ORIGIN?.trim();
	if (configured) return configured.replace(/\/+$/, '');
	if (dev) return requestOrigin;
	throw new Error(
		'ORIGIN env var must be set in production so verification links use a trusted public origin.'
	);
}

function generateToken(): string {
	return randomBytes(32).toString('hex');
}

async function createVerificationToken(userId: string): Promise<string> {
	const id = generateToken();
	const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
	await prisma.emailVerificationToken.create({ data: { id, userId, expiresAt } });
	return id;
}

export type ConsumedToken =
	| { ok: true; userId: string }
	| { ok: false; reason: 'invalid' | 'expired' };

export async function consumeVerificationToken(token: string): Promise<ConsumedToken> {
	if (!token) return { ok: false, reason: 'invalid' };
	const row = await prisma.emailVerificationToken.findUnique({ where: { id: token } });
	if (!row) return { ok: false, reason: 'invalid' };
	if (row.expiresAt.getTime() < Date.now()) {
		await prisma.emailVerificationToken.delete({ where: { id: token } }).catch(() => {});
		return { ok: false, reason: 'expired' };
	}
	await prisma.emailVerificationToken.delete({ where: { id: token } });
	return { ok: true, userId: row.userId };
}

function buildVerifyUrl(origin: string, token: string): string {
	return `${origin}/verify-email?token=${encodeURIComponent(token)}`;
}

export type SendVerificationResult =
	| { ok: true }
	| { ok: false; reason: 'cooldown' | 'daily_cap'; retryAfterMs: number };

/**
 * Sends a verification email subject to per-user rate limits:
 *   - cooldown: skip if the most recent token (within the last 24h window) is less
 *     than 60s old.
 *   - daily cap: skip if 5 or more sends have been recorded in the rolling 24h
 *     window.
 *
 * The "send count" is approximated by counting unconsumed tokens created in the
 * window. Verified tokens get deleted by consumeVerificationToken, so this is
 * fine for the dominant abuse case (an attacker repeatedly requesting resends
 * without ever clicking the link). A user who legitimately verifies frees their
 * own budget.
 *
 * Callers must NOT surface the result to anonymous users — keep the response
 * generic so attackers can't probe whether an email exists or is rate-limited.
 */
export async function sendVerificationEmail(
	user: { id: string; email: string; displayName: string | null; username: string },
	requestOrigin: string
): Promise<SendVerificationResult> {
	// Resolve the trusted public origin before any DB writes so a missing
	// ORIGIN env in prod fails fast — *before* we issue a token.
	const origin = publicOrigin(requestOrigin);
	const now = Date.now();
	const windowStart = new Date(now - RATE_LIMIT_WINDOW_MS);

	const recent = await prisma.emailVerificationToken.findMany({
		where: { userId: user.id, createdAt: { gte: windowStart } },
		orderBy: { createdAt: 'desc' },
		select: { createdAt: true }
	});

	if (recent.length > 0) {
		const lastMs = recent[0].createdAt.getTime();
		const sinceLastMs = now - lastMs;
		if (sinceLastMs < RESEND_COOLDOWN_MS) {
			return {
				ok: false,
				reason: 'cooldown',
				retryAfterMs: RESEND_COOLDOWN_MS - sinceLastMs
			};
		}
	}

	if (recent.length >= RESEND_DAILY_CAP) {
		const oldestMs = recent[recent.length - 1].createdAt.getTime();
		const retryAfterMs = Math.max(0, RATE_LIMIT_WINDOW_MS - (now - oldestMs));
		return { ok: false, reason: 'daily_cap', retryAfterMs };
	}

	const token = await createVerificationToken(user.id);
	const link = buildVerifyUrl(origin, token);
	const name = user.displayName ?? user.username;
	try {
		await sendEmail({
			to: user.email,
			subject: 'Verify your Kalenj.in email',
			text:
				`Hi ${name},\n\n` +
				`Confirm your email address by opening this link within 24 hours:\n${link}\n\n` +
				`If you didn't create an account on Kalenj.in, you can ignore this message.`
		});
	} catch (err) {
		// Delivery failed (Resend outage, network, etc.). Roll the token back so
		// the user's 60s cooldown and 5-per-day cap aren't burned by attempts that
		// never actually reached their inbox. We rethrow so callers (signup) still
		// get to roll back the user row; the resend action swallows it on top of
		// this so account existence isn't leaked.
		await prisma.emailVerificationToken
			.delete({ where: { id: token } })
			.catch(() => {});
		throw err;
	}
	return { ok: true };
}
