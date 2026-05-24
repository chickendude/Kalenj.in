import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		emailVerificationToken: {
			create: vi.fn(),
			findUnique: vi.fn(),
			findMany: vi.fn(),
			delete: vi.fn()
		}
	};
	const email = {
		sendEmail: vi.fn()
	};
	const envState: { ORIGIN?: string } = {};
	const environment = { dev: true };
	return { prisma, email, envState, environment };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('./email', () => ({ sendEmail: mocks.email.sendEmail }));
vi.mock('$app/environment', () => mocks.environment);
vi.mock('$env/dynamic/private', () => ({
	get env() {
		return mocks.envState;
	}
}));

const { consumeVerificationToken, sendVerificationEmail } = await import('./verification');

const TEST_USER = {
	id: 'u1',
	email: 'someone@example.com',
	displayName: 'Some One',
	username: 'someone'
};

beforeEach(() => {
	mocks.prisma.emailVerificationToken.create.mockReset();
	mocks.prisma.emailVerificationToken.findUnique.mockReset();
	mocks.prisma.emailVerificationToken.findMany.mockReset();
	mocks.prisma.emailVerificationToken.delete.mockReset();
	mocks.email.sendEmail.mockReset();
	mocks.envState.ORIGIN = undefined;
	mocks.environment.dev = true;
});

describe('consumeVerificationToken', () => {
	it('returns { ok:false, reason:"invalid" } for a missing token', async () => {
		expect(await consumeVerificationToken('')).toEqual({ ok: false, reason: 'invalid' });
		expect(mocks.prisma.emailVerificationToken.findUnique).not.toHaveBeenCalled();
	});

	it('returns { ok:false, reason:"invalid" } when the token row is absent', async () => {
		mocks.prisma.emailVerificationToken.findUnique.mockResolvedValue(null);

		const result = await consumeVerificationToken('deadbeef');

		expect(result).toEqual({ ok: false, reason: 'invalid' });
		expect(mocks.prisma.emailVerificationToken.delete).not.toHaveBeenCalled();
	});

	it('deletes an expired token and returns { ok:false, reason:"expired" }', async () => {
		mocks.prisma.emailVerificationToken.findUnique.mockResolvedValue({
			id: 'tok-expired',
			userId: 'u1',
			expiresAt: new Date(Date.now() - 1000)
		});
		mocks.prisma.emailVerificationToken.delete.mockResolvedValue(undefined);

		const result = await consumeVerificationToken('tok-expired');

		expect(result).toEqual({ ok: false, reason: 'expired' });
		expect(mocks.prisma.emailVerificationToken.delete).toHaveBeenCalledWith({
			where: { id: 'tok-expired' }
		});
	});

	it('swallows delete errors when cleaning up an expired token', async () => {
		mocks.prisma.emailVerificationToken.findUnique.mockResolvedValue({
			id: 'tok-expired',
			userId: 'u1',
			expiresAt: new Date(Date.now() - 1000)
		});
		mocks.prisma.emailVerificationToken.delete.mockRejectedValue(new Error('race: gone'));

		const result = await consumeVerificationToken('tok-expired');

		expect(result).toEqual({ ok: false, reason: 'expired' });
	});

	it('consumes a valid token, deletes the row, and returns the userId', async () => {
		mocks.prisma.emailVerificationToken.findUnique.mockResolvedValue({
			id: 'tok-good',
			userId: 'u42',
			expiresAt: new Date(Date.now() + 60_000)
		});
		mocks.prisma.emailVerificationToken.delete.mockResolvedValue(undefined);

		const result = await consumeVerificationToken('tok-good');

		expect(result).toEqual({ ok: true, userId: 'u42' });
		expect(mocks.prisma.emailVerificationToken.delete).toHaveBeenCalledWith({
			where: { id: 'tok-good' }
		});
	});
});

describe('sendVerificationEmail', () => {
	it('sends and reports ok when no prior tokens exist', async () => {
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([]);
		mocks.prisma.emailVerificationToken.create.mockResolvedValue(undefined);
		mocks.email.sendEmail.mockResolvedValue(undefined);

		const result = await sendVerificationEmail(TEST_USER, 'https://kalenj.in');

		expect(result).toEqual({ ok: true });
		expect(mocks.email.sendEmail).toHaveBeenCalledTimes(1);
		const args = mocks.email.sendEmail.mock.calls[0][0];
		expect(args.to).toBe(TEST_USER.email);
		expect(args.subject).toMatch(/verify/i);
		expect(args.text).toMatch(/Hi Some One/);
		expect(args.text).toMatch(/https:\/\/kalenj\.in\/verify-email\?token=[0-9a-f]{64}/);
	});

	it('falls back to username when displayName is null', async () => {
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([]);
		mocks.prisma.emailVerificationToken.create.mockResolvedValue(undefined);
		mocks.email.sendEmail.mockResolvedValue(undefined);

		await sendVerificationEmail({ ...TEST_USER, displayName: null }, 'https://kalenj.in');

		expect(mocks.email.sendEmail.mock.calls[0][0].text).toMatch(/Hi someone,/);
	});

	it('refuses with reason "cooldown" when the latest token is younger than 60s', async () => {
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([
			{ createdAt: new Date(Date.now() - 10_000) }
		]);

		const result = await sendVerificationEmail(TEST_USER, 'https://kalenj.in');

		expect(result.ok).toBe(false);
		if (result.ok) return; // type guard
		expect(result.reason).toBe('cooldown');
		expect(result.retryAfterMs).toBeGreaterThan(0);
		expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
		expect(mocks.email.sendEmail).not.toHaveBeenCalled();
		expect(mocks.prisma.emailVerificationToken.create).not.toHaveBeenCalled();
	});

	it('sends when the latest token is older than 60s and the cap is not reached', async () => {
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([
			{ createdAt: new Date(Date.now() - 70_000) },
			{ createdAt: new Date(Date.now() - 3_600_000) }
		]);
		mocks.prisma.emailVerificationToken.create.mockResolvedValue(undefined);
		mocks.email.sendEmail.mockResolvedValue(undefined);

		const result = await sendVerificationEmail(TEST_USER, 'https://kalenj.in');

		expect(result).toEqual({ ok: true });
		expect(mocks.email.sendEmail).toHaveBeenCalledTimes(1);
	});

	it('refuses with reason "daily_cap" once 5 tokens exist in the window', async () => {
		const now = Date.now();
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([
			{ createdAt: new Date(now - 2 * 60_000) },
			{ createdAt: new Date(now - 60 * 60_000) },
			{ createdAt: new Date(now - 4 * 60 * 60_000) },
			{ createdAt: new Date(now - 12 * 60 * 60_000) },
			{ createdAt: new Date(now - 20 * 60 * 60_000) }
		]);

		const result = await sendVerificationEmail(TEST_USER, 'https://kalenj.in');

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe('daily_cap');
		expect(result.retryAfterMs).toBeGreaterThan(0);
		expect(mocks.email.sendEmail).not.toHaveBeenCalled();
		expect(mocks.prisma.emailVerificationToken.create).not.toHaveBeenCalled();
	});

	it('queries the token table with a 24h rolling window', async () => {
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([]);
		mocks.prisma.emailVerificationToken.create.mockResolvedValue(undefined);
		mocks.email.sendEmail.mockResolvedValue(undefined);

		const before = Date.now();
		await sendVerificationEmail(TEST_USER, 'https://kalenj.in');

		expect(mocks.prisma.emailVerificationToken.findMany).toHaveBeenCalledTimes(1);
		const where = mocks.prisma.emailVerificationToken.findMany.mock.calls[0][0].where;
		expect(where.userId).toBe(TEST_USER.id);
		const gte: Date = where.createdAt.gte;
		expect(gte).toBeInstanceOf(Date);
		const windowMs = before - gte.getTime();
		// 24h ± small skew for execution time
		expect(windowMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 2000);
		expect(windowMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 2000);
	});

	it('persists a 64-hex token with a 24h expiry', async () => {
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([]);
		mocks.prisma.emailVerificationToken.create.mockResolvedValue(undefined);
		mocks.email.sendEmail.mockResolvedValue(undefined);

		const before = Date.now();
		await sendVerificationEmail(TEST_USER, 'https://kalenj.in');
		const after = Date.now();

		expect(mocks.prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
		const data = mocks.prisma.emailVerificationToken.create.mock.calls[0][0].data;
		expect(data.id).toMatch(/^[0-9a-f]{64}$/);
		expect(data.userId).toBe(TEST_USER.id);
		expect(data.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
			24 * 60 * 60 * 1000 - 1000
		);
		expect(data.expiresAt.getTime() - after).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
	});

	it('issues a distinct token on every call', async () => {
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([]);
		mocks.prisma.emailVerificationToken.create.mockResolvedValue(undefined);
		mocks.email.sendEmail.mockResolvedValue(undefined);

		await sendVerificationEmail(TEST_USER, 'https://kalenj.in');
		await sendVerificationEmail(TEST_USER, 'https://kalenj.in');

		const a = mocks.prisma.emailVerificationToken.create.mock.calls[0][0].data.id;
		const b = mocks.prisma.emailVerificationToken.create.mock.calls[1][0].data.id;
		expect(a).not.toBe(b);
	});

	it('uses ORIGIN env var for the verify link instead of the request origin', async () => {
		mocks.envState.ORIGIN = 'https://kalenj.in/';
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([]);
		mocks.prisma.emailVerificationToken.create.mockResolvedValue(undefined);
		mocks.email.sendEmail.mockResolvedValue(undefined);

		await sendVerificationEmail(TEST_USER, 'http://attacker.example.com');

		const body = mocks.email.sendEmail.mock.calls[0][0].text as string;
		expect(body).toContain('https://kalenj.in/verify-email?token=');
		expect(body).not.toContain('attacker.example.com');
	});

	it('falls back to the request origin in dev when ORIGIN is unset', async () => {
		mocks.environment.dev = true;
		mocks.envState.ORIGIN = undefined;
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([]);
		mocks.prisma.emailVerificationToken.create.mockResolvedValue(undefined);
		mocks.email.sendEmail.mockResolvedValue(undefined);

		await sendVerificationEmail(TEST_USER, 'http://localhost:5174');

		const body = mocks.email.sendEmail.mock.calls[0][0].text as string;
		expect(body).toContain('http://localhost:5174/verify-email?token=');
	});

	it('refuses to send in prod when ORIGIN env is unset (fail-closed)', async () => {
		mocks.environment.dev = false;
		mocks.envState.ORIGIN = undefined;
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([]);

		await expect(
			sendVerificationEmail(TEST_USER, 'https://attacker.example.com')
		).rejects.toThrow(/ORIGIN env var must be set/);
		expect(mocks.prisma.emailVerificationToken.create).not.toHaveBeenCalled();
		expect(mocks.email.sendEmail).not.toHaveBeenCalled();
	});

	it('propagates send errors so the caller can roll back the user row', async () => {
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([]);
		mocks.prisma.emailVerificationToken.create.mockResolvedValue(undefined);
		mocks.prisma.emailVerificationToken.delete.mockResolvedValue(undefined);
		mocks.email.sendEmail.mockRejectedValue(new Error('Resend down'));

		await expect(sendVerificationEmail(TEST_USER, 'https://kalenj.in')).rejects.toThrow(
			'Resend down'
		);
	});

	it('deletes the just-issued token when send fails so the budget isnt burned', async () => {
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([]);
		mocks.prisma.emailVerificationToken.create.mockResolvedValue(undefined);
		mocks.prisma.emailVerificationToken.delete.mockResolvedValue(undefined);
		mocks.email.sendEmail.mockRejectedValue(new Error('Resend exploded'));

		await expect(sendVerificationEmail(TEST_USER, 'https://kalenj.in')).rejects.toThrow();

		expect(mocks.prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
		const createdId = mocks.prisma.emailVerificationToken.create.mock.calls[0][0].data.id;
		expect(mocks.prisma.emailVerificationToken.delete).toHaveBeenCalledTimes(1);
		expect(mocks.prisma.emailVerificationToken.delete).toHaveBeenCalledWith({
			where: { id: createdId }
		});
	});

	it('swallows a token-delete failure during rollback (best-effort cleanup)', async () => {
		// If even the rollback delete fails, we still want the send error to
		// propagate so the caller (signup) can roll the user back.
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([]);
		mocks.prisma.emailVerificationToken.create.mockResolvedValue(undefined);
		mocks.prisma.emailVerificationToken.delete.mockRejectedValue(
			new Error('race: already gone')
		);
		mocks.email.sendEmail.mockRejectedValue(new Error('Resend exploded'));

		await expect(sendVerificationEmail(TEST_USER, 'https://kalenj.in')).rejects.toThrow(
			'Resend exploded'
		);
		expect(mocks.prisma.emailVerificationToken.delete).toHaveBeenCalledTimes(1);
	});

	it('does not touch token.delete on the happy path', async () => {
		mocks.prisma.emailVerificationToken.findMany.mockResolvedValue([]);
		mocks.prisma.emailVerificationToken.create.mockResolvedValue(undefined);
		mocks.email.sendEmail.mockResolvedValue(undefined);

		await sendVerificationEmail(TEST_USER, 'https://kalenj.in');

		expect(mocks.prisma.emailVerificationToken.delete).not.toHaveBeenCalled();
	});
});
