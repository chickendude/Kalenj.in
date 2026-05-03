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
		processAudio: vi.fn(),
		saveAudio: vi.fn(),
		deleteAudio: vi.fn()
	};
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('$lib/server/audio-processing', () => ({ processAudio: mocks.processAudio }));
vi.mock('$lib/server/audio-storage', () => ({
	saveAudio: mocks.saveAudio,
	deleteAudio: mocks.deleteAudio
}));

const { POST } = await import('./+server');

const locals = {
	user: { id: 'u1', username: 'admin', displayName: null, role: 'ADMIN' as const },
	sessionToken: 't'
};

function audioRequest(overrides: { targetType?: string; targetId?: string; file?: File } = {}) {
	const formData = new FormData();
	formData.set('file', overrides.file ?? new File(['audio'], 'recording.webm', { type: 'audio/webm' }));
	formData.set('targetType', overrides.targetType ?? 'word');
	formData.set('targetId', overrides.targetId ?? 'word-1');

	return new Request('http://localhost/api/audio/upload', {
		method: 'POST',
		body: formData
	});
}

async function post(request = audioRequest()) {
	return POST({ request, locals } as never);
}

beforeEach(() => {
	mocks.prisma.word.findUnique.mockReset();
	mocks.prisma.word.update.mockReset();
	mocks.prisma.exampleSentence.findUnique.mockReset();
	mocks.prisma.exampleSentence.update.mockReset();
	mocks.processAudio.mockReset();
	mocks.saveAudio.mockReset();
	mocks.deleteAudio.mockReset();

	mocks.prisma.word.findUnique.mockResolvedValue({ audioUrl: null });
	mocks.prisma.word.update.mockResolvedValue({});
	mocks.processAudio.mockResolvedValue(Buffer.from('mp3'));
	mocks.saveAudio.mockResolvedValue({ filename: 'audio.mp3', publicUrl: '/audio/audio.mp3' });
	mocks.deleteAudio.mockResolvedValue(undefined);
});

describe('POST /api/audio/upload', () => {
	it('returns the saved audio url after processing and attaching the upload', async () => {
		const response = await post();

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ audioUrl: '/audio/audio.mp3' });
		expect(mocks.processAudio).toHaveBeenCalledWith(Buffer.from('audio'));
		expect(mocks.prisma.word.update).toHaveBeenCalledWith({
			where: { id: 'word-1' },
			data: {
				audioUrl: '/audio/audio.mp3',
				audioRecordedById: 'u1',
				audioRecordedAt: expect.any(Date)
			}
		});
	});

	it('turns storage write failures into a useful server error', async () => {
		mocks.saveAudio.mockRejectedValue(new Error('EACCES'));

		await expect(post()).rejects.toMatchObject({
			status: 500,
			body: {
				message: 'Could not save audio. Please try again.'
			}
		});
	});

	it('cleans up newly written audio when the database update fails', async () => {
		mocks.prisma.word.update.mockRejectedValue(new Error('column "audioRecordedById" does not exist'));

		await expect(post()).rejects.toMatchObject({
			status: 500,
			body: {
				message: 'Could not attach audio to the entry. Please try again.'
			}
		});
		expect(mocks.deleteAudio).toHaveBeenCalledWith('/audio/audio.mp3');
	});

	it('reports lookup failures before processing the audio', async () => {
		mocks.prisma.word.findUnique.mockRejectedValue(new Error('database unavailable'));

		await expect(post()).rejects.toMatchObject({
			status: 500,
			body: {
				message: 'Could not read audio data. Please try again.'
			}
		});
		expect(mocks.processAudio).not.toHaveBeenCalled();
		expect(mocks.saveAudio).not.toHaveBeenCalled();
	});
});
