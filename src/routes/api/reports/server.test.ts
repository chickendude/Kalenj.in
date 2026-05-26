import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		word: { findUnique: vi.fn() },
		exampleSentence: { findUnique: vi.fn() },
		report: {
			findFirst: vi.fn(),
			create: vi.fn(),
			update: vi.fn()
		}
	};
	return { prisma };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

// Reset the in-memory limiter between tests so each test starts with an
// empty bucket — otherwise per-IP/per-user state leaks across cases.
const { _resetRateLimitForTests } = await import('$lib/server/rate-limit');
const { POST } = await import('./+server');

type Role = 'ADMIN' | 'MANAGER' | 'USER';
type Locals = {
	user: { id: string; username: string; displayName: null; role: Role } | null;
	sessionToken: string | null;
};

const anonLocals: Locals = { user: null, sessionToken: null };
const userLocals: Locals = {
	user: { id: 'u1', username: 'someone', displayName: null, role: 'USER' },
	sessionToken: 't'
};

function reportRequest(body: Record<string, unknown>) {
	return new Request('http://localhost/api/reports', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

function call(
	body: Record<string, unknown>,
	{
		locals = anonLocals,
		clientAddress = '203.0.113.1'
	}: { locals?: Locals; clientAddress?: string } = {}
) {
	return POST({
		request: reportRequest(body),
		locals,
		getClientAddress: () => clientAddress
	} as never);
}

const VALID_WORD_BODY = {
	targetType: 'WORD',
	targetId: 'word-1',
	issueType: 'WRONG_TRANSLATION',
	suggestedFix: null
};

beforeEach(() => {
	_resetRateLimitForTests();
	for (const model of [mocks.prisma.word, mocks.prisma.exampleSentence, mocks.prisma.report]) {
		for (const mock of Object.values(model)) {
			mock.mockReset();
		}
	}
	mocks.prisma.word.findUnique.mockResolvedValue({ id: 'word-1' });
	mocks.prisma.exampleSentence.findUnique.mockResolvedValue({ id: 'sentence-1' });
	mocks.prisma.report.findFirst.mockResolvedValue(null);
	mocks.prisma.report.create.mockResolvedValue({ id: 'r-new' });
	mocks.prisma.report.update.mockResolvedValue({ id: 'r-existing' });
});

describe('POST /api/reports — input validation', () => {
	it('rejects an unknown targetType', async () => {
		await expect(call({ ...VALID_WORD_BODY, targetType: 'BOGUS' })).rejects.toMatchObject({
			status: 400
		});
	});

	it('rejects a missing targetId', async () => {
		await expect(call({ ...VALID_WORD_BODY, targetId: '   ' })).rejects.toMatchObject({
			status: 400
		});
	});

	it('rejects an issueType outside the whitelist', async () => {
		await expect(
			call({ ...VALID_WORD_BODY, issueType: 'INAPPROPRIATE' })
		).rejects.toMatchObject({ status: 400 });
	});

	it('rejects an oversize suggestedFix', async () => {
		await expect(
			call({ ...VALID_WORD_BODY, suggestedFix: 'a'.repeat(2001) })
		).rejects.toMatchObject({ status: 400 });
	});

	it('returns 404 when the word does not exist', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue(null);
		await expect(call(VALID_WORD_BODY)).rejects.toMatchObject({ status: 404 });
		expect(mocks.prisma.report.create).not.toHaveBeenCalled();
	});

	it('returns 404 when the sentence does not exist', async () => {
		mocks.prisma.exampleSentence.findUnique.mockResolvedValue(null);
		await expect(
			call({ ...VALID_WORD_BODY, targetType: 'SENTENCE', targetId: 'sentence-1' })
		).rejects.toMatchObject({ status: 404 });
		expect(mocks.prisma.report.create).not.toHaveBeenCalled();
	});
});

describe('POST /api/reports — successful submissions', () => {
	it('creates a row with reporterId=null for anonymous submissions', async () => {
		const response = await call({ ...VALID_WORD_BODY, suggestedFix: '  fix me  ' });
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });

		expect(mocks.prisma.report.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				targetType: 'WORD',
				wordId: 'word-1',
				sentenceId: null,
				issueType: 'WRONG_TRANSLATION',
				suggestedFix: 'fix me',
				reporterId: null
			})
		});
	});

	it('captures the reporter id when the user is signed in', async () => {
		await call(VALID_WORD_BODY, { locals: userLocals });
		expect(mocks.prisma.report.create).toHaveBeenCalledWith({
			data: expect.objectContaining({ reporterId: 'u1' })
		});
	});

	it('writes a SENTENCE report when targetType is SENTENCE', async () => {
		await call({ ...VALID_WORD_BODY, targetType: 'SENTENCE', targetId: 'sentence-1' });
		expect(mocks.prisma.report.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				targetType: 'SENTENCE',
				wordId: null,
				sentenceId: 'sentence-1'
			})
		});
	});
});

describe('POST /api/reports — duplicate suppression', () => {
	it('returns deduped:true and does not create when an OPEN report exists for the same target+issueType', async () => {
		mocks.prisma.report.findFirst.mockResolvedValue({ id: 'r-existing', suggestedFix: 'older fix' });

		const response = await call(VALID_WORD_BODY);
		await expect(response.json()).resolves.toEqual({ ok: true, deduped: true });
		expect(mocks.prisma.report.create).not.toHaveBeenCalled();
		expect(mocks.prisma.report.update).not.toHaveBeenCalled();
	});

	it('attaches a suggestedFix to an existing report that had none', async () => {
		mocks.prisma.report.findFirst.mockResolvedValue({ id: 'r-existing', suggestedFix: null });

		const response = await call({ ...VALID_WORD_BODY, suggestedFix: 'new info' });
		await expect(response.json()).resolves.toEqual({ ok: true, deduped: true });
		expect(mocks.prisma.report.update).toHaveBeenCalledWith({
			where: { id: 'r-existing' },
			data: { suggestedFix: 'new info' }
		});
		expect(mocks.prisma.report.create).not.toHaveBeenCalled();
	});
});

describe('POST /api/reports — rate limit', () => {
	it('returns 429 once the anonymous IP exceeds the per-hour limit', async () => {
		const ip = '198.51.100.7';
		// Default anon limit is 10/hour — make 10 successful submissions, vary
		// the issueType so the dedupe path doesn't short-circuit.
		const issueTypes = ['WRONG_TRANSLATION', 'MISSPELLING', 'AUDIO_ISSUE', 'OTHER'];
		for (let i = 0; i < 10; i++) {
			const res = await call(
				{ ...VALID_WORD_BODY, issueType: issueTypes[i % issueTypes.length] },
				{ clientAddress: ip }
			);
			expect(res.status).toBe(200);
		}

		const blocked = await call(VALID_WORD_BODY, { clientAddress: ip });
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get('Retry-After')).toBeTruthy();
	});

	it('keys the limit by user id when authenticated (different IPs do not bypass)', async () => {
		const issueTypes = ['WRONG_TRANSLATION', 'MISSPELLING', 'AUDIO_ISSUE', 'OTHER'];
		// Signed-in limit is 30/hour. Submit 30 times across two IPs.
		for (let i = 0; i < 30; i++) {
			const res = await call(
				{ ...VALID_WORD_BODY, issueType: issueTypes[i % issueTypes.length] },
				{ locals: userLocals, clientAddress: i % 2 === 0 ? '1.1.1.1' : '2.2.2.2' }
			);
			expect(res.status).toBe(200);
		}

		const blocked = await call(VALID_WORD_BODY, {
			locals: userLocals,
			clientAddress: '3.3.3.3'
		});
		expect(blocked.status).toBe(429);
	});
});
