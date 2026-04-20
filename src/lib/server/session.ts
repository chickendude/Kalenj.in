import { randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { prisma } from './prisma';

export const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEWAL_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

function generateSessionId(): string {
	return randomBytes(32).toString('hex');
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
	const id = generateSessionId();
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
	await prisma.session.create({ data: { id, userId, expiresAt } });
	return { id, expiresAt };
}

export type ValidatedSession = {
	session: { id: string; userId: string; expiresAt: Date };
	user: {
		id: string;
		username: string;
		displayName: string | null;
		role: 'ADMIN' | 'MANAGER';
	};
	renewed: boolean;
};

export async function validateSession(token: string): Promise<ValidatedSession | null> {
	if (!token) return null;
	const session = await prisma.session.findUnique({
		where: { id: token },
		include: { user: true }
	});
	if (!session) return null;
	if (session.expiresAt.getTime() < Date.now()) {
		await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
		return null;
	}
	let renewed = false;
	let expiresAt = session.expiresAt;
	if (session.expiresAt.getTime() - Date.now() < RENEWAL_THRESHOLD_MS) {
		expiresAt = new Date(Date.now() + SESSION_TTL_MS);
		await prisma.session.update({ where: { id: session.id }, data: { expiresAt } });
		renewed = true;
	}
	return {
		session: { id: session.id, userId: session.userId, expiresAt },
		user: {
			id: session.user.id,
			username: session.user.username,
			displayName: session.user.displayName,
			role: session.user.role as 'ADMIN' | 'MANAGER'
		},
		renewed
	};
}

export async function invalidateSession(token: string): Promise<void> {
	await prisma.session.delete({ where: { id: token } }).catch(() => {});
}

export async function invalidateOtherUserSessions(userId: string, keepToken: string): Promise<void> {
	await prisma.session.deleteMany({ where: { userId, NOT: { id: keepToken } } });
}

export async function invalidateAllUserSessions(userId: string): Promise<void> {
	await prisma.session.deleteMany({ where: { userId } });
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		expires: expiresAt
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
