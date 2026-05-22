import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		word: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		exampleSentence: {
			findUnique: vi.fn(),
			update: vi.fn()
		}
	};

	return {
		prisma,
		deleteAudio: vi.fn()
	};
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('$lib/server/audio-storage', () => ({ deleteAudio: mocks.deleteAudio }));

const { POST } = await import('./+server');

const locals = {
	user: { id: 'u1', username: 'admin', displayName: null, role: 'ADMIN' as const },
	sessionToken: 't'
};

function deleteRequest(body: Record<string, unknown>) {
	return new Request('http://localhost/api/audio/delete', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

async function post(body: Record<string, unknown> = { targetType: 'word', targetId: 'word-1' }) {
	return POST({ request: deleteRequest(body), locals } as never);
}

beforeEach(() => {
	mocks.prisma.word.findUnique.mockReset();
	mocks.prisma.word.update.mockReset();
	mocks.prisma.exampleSentence.findUnique.mockReset();
	mocks.prisma.exampleSentence.update.mockReset();
	mocks.deleteAudio.mockReset();

	mocks.prisma.word.update.mockResolvedValue({});
	mocks.prisma.exampleSentence.update.mockResolvedValue({});
	mocks.deleteAudio.mockResolvedValue(undefined);
});

describe('POST /api/audio/delete', () => {
	it('clears the word audio columns and deletes the old file', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue({ audioUrl: '/audio/old.mp3' });

		const response = await post({ targetType: 'word', targetId: 'word-1' });

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(mocks.prisma.word.findUnique).toHaveBeenCalledWith({
			where: { id: 'word-1' },
			select: { audioUrl: true }
		});
		expect(mocks.prisma.word.update).toHaveBeenCalledWith({
			where: { id: 'word-1' },
			data: { audioUrl: null, audioRecordedById: null, audioRecordedAt: null }
		});
		expect(mocks.deleteAudio).toHaveBeenCalledWith('/audio/old.mp3');
	});

	it('clears the word-plural audio columns', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue({ pluralAudioUrl: '/audio/plural.mp3' });

		const response = await post({ targetType: 'word-plural', targetId: 'word-1' });

		expect(response.status).toBe(200);
		expect(mocks.prisma.word.findUnique).toHaveBeenCalledWith({
			where: { id: 'word-1' },
			select: { pluralAudioUrl: true }
		});
		expect(mocks.prisma.word.update).toHaveBeenCalledWith({
			where: { id: 'word-1' },
			data: { pluralAudioUrl: null, pluralAudioRecordedById: null, pluralAudioRecordedAt: null }
		});
		expect(mocks.deleteAudio).toHaveBeenCalledWith('/audio/plural.mp3');
	});

	it('clears the example-sentence audio columns', async () => {
		mocks.prisma.exampleSentence.findUnique.mockResolvedValue({ audioUrl: '/audio/sentence.mp3' });

		const response = await post({ targetType: 'sentence', targetId: 'sentence-1' });

		expect(response.status).toBe(200);
		expect(mocks.prisma.exampleSentence.findUnique).toHaveBeenCalledWith({
			where: { id: 'sentence-1' },
			select: { audioUrl: true }
		});
		expect(mocks.prisma.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 'sentence-1' },
			data: { audioUrl: null, audioRecordedById: null, audioRecordedAt: null }
		});
		expect(mocks.deleteAudio).toHaveBeenCalledWith('/audio/sentence.mp3');
	});

	it('skips deleteAudio when no previous file exists', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue({ audioUrl: null });

		await post({ targetType: 'word', targetId: 'word-1' });

		expect(mocks.deleteAudio).not.toHaveBeenCalled();
	});

	it('returns 404 when the target is missing', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue(null);

		await expect(post({ targetType: 'word', targetId: 'missing' })).rejects.toMatchObject({
			status: 404,
			body: { message: 'Target not found.' }
		});
		expect(mocks.prisma.word.update).not.toHaveBeenCalled();
	});

	it('rejects invalid targetType', async () => {
		await expect(post({ targetType: 'paragraph', targetId: 'x' })).rejects.toMatchObject({
			status: 400,
			body: { message: 'Invalid targetType.' }
		});
	});

	it('rejects missing targetId', async () => {
		await expect(post({ targetType: 'word' })).rejects.toMatchObject({
			status: 400,
			body: { message: 'Missing targetId.' }
		});
	});
});
