import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		$executeRaw: vi.fn(),
		$transaction: vi.fn(),
		word: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			update: vi.fn()
		}
	};
	prisma.$transaction.mockImplementation(async (callback) => callback(prisma));

	return {
		prisma,
		propagateKalenjinRename: vi.fn()
	};
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('$lib/server/propagate-rename', () => ({
	propagateKalenjinRename: mocks.propagateKalenjinRename
}));

const { POST } = await import('./+server');

const locals = {
	user: { id: 'u1', username: 'admin', displayName: null, role: 'ADMIN' as const },
	sessionToken: 't'
};

function inlineRequest(body: Record<string, unknown>) {
	return new Request('http://localhost/dictionary/kot/inline', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

function post(body: Record<string, unknown>, id = 'kot') {
	return POST({
		params: { id },
		locals,
		request: inlineRequest(body)
	} as never);
}

beforeEach(() => {
	mocks.prisma.$executeRaw.mockReset();
	mocks.prisma.$transaction.mockReset();
	mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
	mocks.prisma.word.findUnique.mockReset();
	mocks.prisma.word.findMany.mockReset();
	mocks.prisma.word.update.mockReset();
	mocks.propagateKalenjinRename.mockReset();

	mocks.prisma.word.findMany.mockResolvedValue([]);
	mocks.prisma.word.update.mockResolvedValue({
		id: 'word-a',
		kalenjin: 'kot',
		translations: 'bag'
	});
});

describe('POST /dictionary/[id]/inline', () => {
	it('rejects blank Kalenjin values before updating the word', async () => {
		mocks.prisma.word.findUnique.mockResolvedValueOnce({ id: 'word-a' });

		await expect(post({ field: 'kalenjin', value: '   ' })).rejects.toMatchObject({
			status: 400,
			body: { message: 'Kalenjin is required.' }
		});

		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
		expect(mocks.prisma.word.update).not.toHaveBeenCalled();
	});

	it('rejects blank translation values before updating the word', async () => {
		mocks.prisma.word.findUnique.mockResolvedValueOnce({ id: 'word-a' });

		await expect(post({ field: 'translations', value: '' })).rejects.toMatchObject({
			status: 400,
			body: { message: 'Translations are required.' }
		});

		expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
		expect(mocks.prisma.word.update).not.toHaveBeenCalled();
	});

	it('does not regenerate the slug when the inline Kalenjin value is unchanged', async () => {
		mocks.prisma.word.findUnique
			.mockResolvedValueOnce({ id: 'word-a' })
			.mockResolvedValueOnce({ id: 'word-a', kalenjin: 'kot', slug: 'kot-2' });

		const response = await post({ field: 'kalenjin', value: ' kot ' });

		expect(response.status).toBe(200);
		expect(mocks.prisma.word.update).toHaveBeenCalledWith({
			where: { id: 'word-a' },
			data: { kalenjin: 'kot' }
		});
		expect(mocks.prisma.$executeRaw).not.toHaveBeenCalled();
		expect(mocks.prisma.word.findMany).not.toHaveBeenCalled();
		expect(mocks.propagateKalenjinRename).not.toHaveBeenCalled();
	});

	it('regenerates the slug and propagates links when inline Kalenjin is renamed', async () => {
		mocks.prisma.word.findUnique
			.mockResolvedValueOnce({ id: 'word-a' })
			.mockResolvedValueOnce({ id: 'word-a', kalenjin: 'kot', slug: 'kot' });
		mocks.prisma.word.update.mockResolvedValue({
			id: 'word-a',
			kalenjin: 'kota',
			translations: 'bag'
		});

		const response = await post({ field: 'kalenjin', value: 'kota' });

		expect(response.status).toBe(200);
		expect(mocks.prisma.word.update).toHaveBeenCalledWith({
			where: { id: 'word-a' },
			data: { kalenjin: 'kota', slug: 'kota' }
		});
		expect(mocks.propagateKalenjinRename).toHaveBeenCalledWith(
			mocks.prisma,
			'word-a',
			'kota',
			'kot'
		);
	});
});
