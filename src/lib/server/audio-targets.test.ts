import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	prisma: {
		word: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		exampleSentence: {
			findUnique: vi.fn(),
			update: vi.fn()
		}
	}
}));

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

const {
	ALLOWED_MIME,
	MAX_UPLOAD_BYTES,
	clearAudioUrl,
	isTargetType,
	readPreviousAudioUrl,
	writeAudioUrl
} = await import('./audio-targets');

beforeEach(() => {
	mocks.prisma.word.findUnique.mockReset();
	mocks.prisma.word.update.mockReset();
	mocks.prisma.exampleSentence.findUnique.mockReset();
	mocks.prisma.exampleSentence.update.mockReset();

	mocks.prisma.word.update.mockResolvedValue({});
	mocks.prisma.exampleSentence.update.mockResolvedValue({});
});

describe('audio-targets constants', () => {
	it('exports the 10MB upload cap', () => {
		expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
	});

	it('accepts the audio MIME types that the recorders produce', () => {
		for (const mime of ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav']) {
			expect(ALLOWED_MIME.has(mime)).toBe(true);
		}
		expect(ALLOWED_MIME.has('audio/flac')).toBe(false);
	});
});

describe('isTargetType', () => {
	it('accepts the three known targets', () => {
		expect(isTargetType('word')).toBe(true);
		expect(isTargetType('word-plural')).toBe(true);
		expect(isTargetType('sentence')).toBe(true);
	});

	it('rejects everything else', () => {
		expect(isTargetType('paragraph')).toBe(false);
		expect(isTargetType('')).toBe(false);
		expect(isTargetType(null)).toBe(false);
		expect(isTargetType(undefined)).toBe(false);
		expect(isTargetType(42)).toBe(false);
	});
});

describe('readPreviousAudioUrl', () => {
	it('reads the word audioUrl column', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue({ audioUrl: '/audio/w.mp3' });
		await expect(readPreviousAudioUrl('word', 'word-1')).resolves.toEqual({
			found: true,
			previousUrl: '/audio/w.mp3'
		});
		expect(mocks.prisma.word.findUnique).toHaveBeenCalledWith({
			where: { id: 'word-1' },
			select: { audioUrl: true }
		});
	});

	it('reads the pluralAudioUrl column for word-plural', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue({ pluralAudioUrl: '/audio/p.mp3' });
		await expect(readPreviousAudioUrl('word-plural', 'word-1')).resolves.toEqual({
			found: true,
			previousUrl: '/audio/p.mp3'
		});
		expect(mocks.prisma.word.findUnique).toHaveBeenCalledWith({
			where: { id: 'word-1' },
			select: { pluralAudioUrl: true }
		});
	});

	it('reads the exampleSentence audioUrl', async () => {
		mocks.prisma.exampleSentence.findUnique.mockResolvedValue({ audioUrl: '/audio/s.mp3' });
		await expect(readPreviousAudioUrl('sentence', 'sentence-1')).resolves.toEqual({
			found: true,
			previousUrl: '/audio/s.mp3'
		});
		expect(mocks.prisma.exampleSentence.findUnique).toHaveBeenCalledWith({
			where: { id: 'sentence-1' },
			select: { audioUrl: true }
		});
	});

	it('reports not-found when prisma returns null', async () => {
		mocks.prisma.word.findUnique.mockResolvedValue(null);
		await expect(readPreviousAudioUrl('word', 'gone')).resolves.toEqual({ found: false });
	});
});

describe('writeAudioUrl', () => {
	const recordedAt = new Date('2026-05-20T10:00:00Z');

	it('writes the word audio fields', async () => {
		await writeAudioUrl('word', 'word-1', '/audio/w.mp3', 'u1', recordedAt);
		expect(mocks.prisma.word.update).toHaveBeenCalledWith({
			where: { id: 'word-1' },
			data: {
				audioUrl: '/audio/w.mp3',
				audioRecordedById: 'u1',
				audioRecordedAt: recordedAt
			}
		});
	});

	it('writes the plural audio fields', async () => {
		await writeAudioUrl('word-plural', 'word-1', '/audio/p.mp3', 'u1', recordedAt);
		expect(mocks.prisma.word.update).toHaveBeenCalledWith({
			where: { id: 'word-1' },
			data: {
				pluralAudioUrl: '/audio/p.mp3',
				pluralAudioRecordedById: 'u1',
				pluralAudioRecordedAt: recordedAt
			}
		});
	});

	it('writes the sentence audio fields', async () => {
		await writeAudioUrl('sentence', 'sentence-1', '/audio/s.mp3', 'u1', recordedAt);
		expect(mocks.prisma.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 'sentence-1' },
			data: {
				audioUrl: '/audio/s.mp3',
				audioRecordedById: 'u1',
				audioRecordedAt: recordedAt
			}
		});
	});
});

describe('clearAudioUrl', () => {
	it('nulls the word audio columns', async () => {
		await clearAudioUrl('word', 'word-1');
		expect(mocks.prisma.word.update).toHaveBeenCalledWith({
			where: { id: 'word-1' },
			data: { audioUrl: null, audioRecordedById: null, audioRecordedAt: null }
		});
	});

	it('nulls the plural audio columns', async () => {
		await clearAudioUrl('word-plural', 'word-1');
		expect(mocks.prisma.word.update).toHaveBeenCalledWith({
			where: { id: 'word-1' },
			data: { pluralAudioUrl: null, pluralAudioRecordedById: null, pluralAudioRecordedAt: null }
		});
	});

	it('nulls the sentence audio columns', async () => {
		await clearAudioUrl('sentence', 'sentence-1');
		expect(mocks.prisma.exampleSentence.update).toHaveBeenCalledWith({
			where: { id: 'sentence-1' },
			data: { audioUrl: null, audioRecordedById: null, audioRecordedAt: null }
		});
	});
});
