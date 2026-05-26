import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		report: {
			findMany: vi.fn(),
			groupBy: vi.fn(),
			update: vi.fn(),
			delete: vi.fn()
		}
	};
	return { prisma };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

const { load, actions } = await import('./+page.server');

type Role = 'ADMIN' | 'MANAGER' | 'USER';
type Locals = {
	user: { id: string; username: string; displayName: null; role: Role } | null;
	sessionToken: string | null;
};

const adminLocals: Locals = {
	user: { id: 'u-admin', username: 'admin', displayName: null, role: 'ADMIN' },
	sessionToken: 't'
};
const managerLocals: Locals = {
	user: { id: 'u-mgr', username: 'mgr', displayName: null, role: 'MANAGER' },
	sessionToken: 't'
};
const userLocals: Locals = {
	user: { id: 'u-user', username: 'user', displayName: null, role: 'USER' },
	sessionToken: 't'
};
const anonLocals: Locals = { user: null, sessionToken: null };

function formRequest(body: Record<string, string>) {
	const params = new URLSearchParams(body);
	return new Request('http://localhost/admin/reports', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: params.toString()
	});
}

beforeEach(() => {
	for (const mock of Object.values(mocks.prisma.report)) {
		mock.mockReset();
	}
	mocks.prisma.report.findMany.mockResolvedValue([]);
	mocks.prisma.report.groupBy.mockResolvedValue([]);
	mocks.prisma.report.update.mockResolvedValue({ id: 'r-1' });
	mocks.prisma.report.delete.mockResolvedValue({ id: 'r-1' });
});

describe('/admin/reports load', () => {
	it('returns 404 for unauthenticated visitors', async () => {
		await expect(
			load({
				locals: anonLocals,
				url: new URL('http://localhost/admin/reports')
			} as never)
		).rejects.toMatchObject({ status: 404 });
	});

	it('returns 404 for plain users', async () => {
		await expect(
			load({
				locals: userLocals,
				url: new URL('http://localhost/admin/reports')
			} as never)
		).rejects.toMatchObject({ status: 404 });
	});

	it('lets managers in', async () => {
		await expect(
			load({
				locals: managerLocals,
				url: new URL('http://localhost/admin/reports')
			} as never)
		).resolves.toBeTruthy();
	});

	it('filters to OPEN by default', async () => {
		await load({
			locals: adminLocals,
			url: new URL('http://localhost/admin/reports')
		} as never);
		expect(mocks.prisma.report.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { status: 'OPEN' } })
		);
	});

	it('applies the status query param when valid', async () => {
		await load({
			locals: adminLocals,
			url: new URL('http://localhost/admin/reports?status=resolved')
		} as never);
		expect(mocks.prisma.report.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { status: 'RESOLVED' } })
		);
	});

	it('omits the where clause when status=all', async () => {
		await load({
			locals: adminLocals,
			url: new URL('http://localhost/admin/reports?status=all')
		} as never);
		expect(mocks.prisma.report.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: {} })
		);
	});

	it('falls back to OPEN for garbage status values', async () => {
		await load({
			locals: adminLocals,
			url: new URL('http://localhost/admin/reports?status=garbage')
		} as never);
		expect(mocks.prisma.report.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { status: 'OPEN' } })
		);
	});

	it('returns counts grouped by status', async () => {
		mocks.prisma.report.groupBy.mockResolvedValue([
			{ status: 'OPEN', _count: { _all: 3 } },
			{ status: 'RESOLVED', _count: { _all: 5 } }
		]);
		const result = (await load({
			locals: adminLocals,
			url: new URL('http://localhost/admin/reports')
		} as never)) as { statusCounts: Record<string, number> };
		expect(result.statusCounts).toMatchObject({ open: 3, resolved: 5, dismissed: 0, all: 8 });
	});
});

describe('/admin/reports actions', () => {
	const action = (name: 'resolve' | 'dismiss' | 'reopen' | 'delete', body: Record<string, string>) =>
		actions[name]({
			request: formRequest(body),
			locals: adminLocals
		} as never);

	it('rejects unauthenticated callers', async () => {
		await expect(
			actions.resolve({ request: formRequest({ reportId: 'r-1' }), locals: anonLocals } as never)
		).rejects.toMatchObject({ status: 404 });
	});

	it('rejects plain users', async () => {
		await expect(
			actions.delete({ request: formRequest({ reportId: 'r-1' }), locals: userLocals } as never)
		).rejects.toMatchObject({ status: 404 });
	});

	it('returns 400 when reportId is missing', async () => {
		const result = await action('resolve', { reportId: '' });
		expect(result).toMatchObject({ status: 400 });
		expect(mocks.prisma.report.update).not.toHaveBeenCalled();
	});

	it('resolve sets status, resolvedAt, and resolvedById', async () => {
		await action('resolve', { reportId: 'r-1' });
		const call = mocks.prisma.report.update.mock.calls[0][0];
		expect(call.where).toEqual({ id: 'r-1' });
		expect(call.data.status).toBe('RESOLVED');
		expect(call.data.resolvedById).toBe('u-admin');
		expect(call.data.resolvedAt).toBeInstanceOf(Date);
	});

	it('dismiss sets status=DISMISSED', async () => {
		await action('dismiss', { reportId: 'r-1' });
		expect(mocks.prisma.report.update.mock.calls[0][0].data.status).toBe('DISMISSED');
	});

	it('reopen sets status=OPEN and clears resolvedAt/resolvedById', async () => {
		await action('reopen', { reportId: 'r-1' });
		const call = mocks.prisma.report.update.mock.calls[0][0];
		expect(call.data.status).toBe('OPEN');
		expect(call.data.resolvedAt).toBeNull();
		expect(call.data.resolvedById).toBeNull();
	});

	it('delete removes the row by id', async () => {
		await action('delete', { reportId: 'r-1' });
		expect(mocks.prisma.report.delete).toHaveBeenCalledWith({ where: { id: 'r-1' } });
	});
});
