import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		user: {
			findUnique: vi.fn(),
			create: vi.fn(),
			delete: vi.fn()
		}
	};
	const password = { hashPassword: vi.fn().mockResolvedValue('hashed') };
	const verification = { sendVerificationEmail: vi.fn() };
	return { prisma, password, verification };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('$lib/server/password', () => ({ hashPassword: mocks.password.hashPassword }));
vi.mock('$lib/server/verification', () => ({
	sendVerificationEmail: mocks.verification.sendVerificationEmail
}));

const { actions } = await import('./+page.server');

function buildRequest(fields: Record<string, string>): Request {
	const body = new URLSearchParams(fields);
	return new Request('http://localhost/signup', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body
	});
}

const validFields = {
	username: 'someone',
	email: 'someone@example.com',
	displayName: 'Some One',
	password: 'temporaryPassword!1',
	confirmPassword: 'temporaryPassword!1',
	redirectTo: ''
};

async function callDefault(fields: Record<string, string>) {
	const url = new URL('http://localhost/signup');
	const request = buildRequest(fields);
	const handler = actions!.default as (event: {
		request: Request;
		url: URL;
	}) => Promise<unknown>;
	return handler({ request, url });
}

beforeEach(() => {
	mocks.prisma.user.findUnique.mockReset();
	mocks.prisma.user.create.mockReset();
	mocks.prisma.user.delete.mockReset();
	mocks.password.hashPassword.mockClear().mockResolvedValue('hashed');
	mocks.verification.sendVerificationEmail.mockReset();
});

describe('signup action: send failure rollback (P2)', () => {
	it('deletes the newly-created user and returns a 500-shaped failure when send throws', async () => {
		mocks.prisma.user.findUnique.mockResolvedValue(null);
		mocks.prisma.user.create.mockResolvedValue({
			id: 'u-new',
			email: validFields.email,
			displayName: 'Some One',
			username: 'someone'
		});
		mocks.prisma.user.delete.mockResolvedValue(undefined);
		mocks.verification.sendVerificationEmail.mockRejectedValue(new Error('Resend exploded'));

		// Suppress the expected error log so the test output stays clean.
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const result = (await callDefault(validFields)) as {
				status: number;
				data: { error: string; username: string };
			};

			expect(result.status).toBe(500);
			expect(result.data.error).toMatch(/couldn't send your verification email/i);
			expect(result.data.username).toBe('someone');

			// Critical: the user row must have been rolled back so the
			// username/email aren't permanently locked.
			expect(mocks.prisma.user.delete).toHaveBeenCalledTimes(1);
			expect(mocks.prisma.user.delete).toHaveBeenCalledWith({
				where: { id: 'u-new' }
			});
		} finally {
			errorSpy.mockRestore();
		}
	});

	it('swallows a failure from prisma.user.delete itself (best-effort cleanup)', async () => {
		mocks.prisma.user.findUnique.mockResolvedValue(null);
		mocks.prisma.user.create.mockResolvedValue({
			id: 'u-new',
			email: validFields.email,
			displayName: null,
			username: 'someone'
		});
		mocks.prisma.user.delete.mockRejectedValue(new Error('also broken'));
		mocks.verification.sendVerificationEmail.mockRejectedValue(new Error('Resend exploded'));

		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const result = (await callDefault(validFields)) as { status: number };
			// We still return a sensible failure to the user even if delete failed.
			expect(result.status).toBe(500);
		} finally {
			errorSpy.mockRestore();
		}
	});

	it('does not touch user.delete when send succeeds', async () => {
		mocks.prisma.user.findUnique.mockResolvedValue(null);
		mocks.prisma.user.create.mockResolvedValue({
			id: 'u-new',
			email: validFields.email,
			displayName: null,
			username: 'someone'
		});
		mocks.verification.sendVerificationEmail.mockResolvedValue({ ok: true });

		// The action throws a redirect on success; SvelteKit's `redirect()` is a
		// thrown object with `status` and `location`.
		await expect(callDefault(validFields)).rejects.toMatchObject({
			status: 303,
			location: expect.stringMatching(/^\/verify-email\/sent\?email=/)
		});

		expect(mocks.prisma.user.delete).not.toHaveBeenCalled();
	});
});
