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

function commitRequest(body: Record<string, unknown>) {
	return new Request('http://localhost/api/audio/bulk/commit', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

async function post(body: Record<string, unknown>) {
	return POST({ request: commitRequest(body), locals } as never);
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

describe('POST /api/audio/bulk/commit', () => {
	it('writes new audio for kept items and deletes their previous files', async () => {
		mocks.prisma.word.findUnique
			.mockResolvedValueOnce({ audioUrl: '/audio/prev-1.mp3' })
			.mockResolvedValueOnce({ audioUrl: null });

		const response = await post({
			targetType: 'word',
			keep: [
				{ targetId: 'word-1', audioUrl: '/audio/new-1.mp3' },
				{ targetId: 'word-2', audioUrl: '/audio/new-2.mp3' }
			],
			discard: []
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			committed: { targetId: string }[];
			failed: unknown[];
			discarded: number;
		};
		expect(body.committed.map((c) => c.targetId)).toEqual(['word-1', 'word-2']);
		expect(body.failed).toEqual([]);
		expect(body.discarded).toBe(0);

		expect(mocks.prisma.word.update).toHaveBeenCalledTimes(2);
		expect(mocks.prisma.word.update).toHaveBeenCalledWith({
			where: { id: 'word-1' },
			data: {
				audioUrl: '/audio/new-1.mp3',
				audioRecordedById: 'u1',
				audioRecordedAt: expect.any(Date)
			}
		});
		expect(mocks.deleteAudio).toHaveBeenCalledWith('/audio/prev-1.mp3');
		expect(mocks.deleteAudio).not.toHaveBeenCalledWith('/audio/new-1.mp3');
	});

	it('writes the right columns for sentence and word-plural targets', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue({ pluralAudioUrl: null });
		mocks.prisma.exampleSentence.findUnique.mockResolvedValue({ audioUrl: null });

		await post({
			keep: [
				{ targetType: 'word-plural', targetId: 'w', audioUrl: '/audio/p.mp3' },
				{ targetType: 'sentence', targetId: 's', audioUrl: '/audio/s.mp3' }
			]
		});

		expect(mocks.prisma.word.update).toHaveBeenCalledWith({
			where: { id: 'w' },
			data: {
				pluralAudioUrl: '/audio/p.mp3',
				pluralAudioRecordedById: 'u1',
				pluralAudioRecordedAt: expect.any(Date)
			}
		});
		expect(mocks.prisma.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 's' },
			data: {
				audioUrl: '/audio/s.mp3',
				audioRecordedById: 'u1',
				audioRecordedAt: expect.any(Date)
			}
		});
	});

	it('deletes discarded urls', async () => {
		const response = await post({
			targetType: 'word',
			keep: [],
			discard: ['/audio/discard-1.mp3', '/audio/discard-2.mp3']
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as { discarded: number };
		expect(body.discarded).toBe(2);
		expect(mocks.deleteAudio).toHaveBeenCalledTimes(2);
		expect(mocks.deleteAudio).toHaveBeenCalledWith('/audio/discard-1.mp3');
		expect(mocks.deleteAudio).toHaveBeenCalledWith('/audio/discard-2.mp3');
	});

	it('reports targets that no longer exist in failed[] and still processes the rest', async () => {
		mocks.prisma.word.findUnique
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ audioUrl: null });

		const response = await post({
			targetType: 'word',
			keep: [
				{ targetId: 'gone', audioUrl: '/audio/g.mp3' },
				{ targetId: 'live', audioUrl: '/audio/l.mp3' }
			]
		});

		const body = (await response.json()) as {
			committed: { targetId: string }[];
			failed: { targetId: string; reason: string }[];
		};
		expect(body.committed.map((c) => c.targetId)).toEqual(['live']);
		expect(body.failed).toEqual([
			{ targetId: 'gone', targetType: 'word', reason: 'Word not found.' }
		]);
	});

	it('rejects duplicate (targetType, targetId) keys in keep', async () => {
		await expect(
			post({
				targetType: 'word',
				keep: [
					{ targetId: 'word-1', audioUrl: '/audio/a.mp3' },
					{ targetId: 'word-1', audioUrl: '/audio/b.mp3' }
				]
			})
		).rejects.toMatchObject({
			status: 400,
			body: { message: expect.stringMatching(/appears more than once/) }
		});
	});

	it('rejects empty payload', async () => {
		await expect(post({ targetType: 'word', keep: [], discard: [] })).rejects.toMatchObject({
			status: 400,
			body: { message: 'No keep or discard entries provided.' }
		});
	});

	it('rejects invalid targetType', async () => {
		await expect(post({ targetType: 'paragraph', keep: [], discard: [] })).rejects.toMatchObject({
			status: 400,
			body: { message: 'Invalid targetType.' }
		});
	});
});
