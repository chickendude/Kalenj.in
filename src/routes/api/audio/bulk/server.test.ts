import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		word: { count: vi.fn() },
		exampleSentence: { count: vi.fn() }
	};

	return {
		prisma,
		saveAudio: vi.fn(),
		processAudioSegments: vi.fn()
	};
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('$lib/server/audio-storage', () => ({ saveAudio: mocks.saveAudio }));
vi.mock('$lib/server/audio-processing', () => ({
	processAudioSegments: mocks.processAudioSegments
}));

const { POST } = await import('./+server');

const locals = {
	user: { id: 'u1', username: 'admin', displayName: null, role: 'ADMIN' as const },
	sessionToken: 't'
};

function bulkRequest(overrides: {
	file?: File | null;
	segments?: unknown;
	targetType?: string;
} = {}) {
	const formData = new FormData();
	if (overrides.file !== null) {
		formData.set(
			'file',
			overrides.file ?? new File(['audio'], 'recording.webm', { type: 'audio/webm' })
		);
	}
	if (overrides.segments !== null) {
		formData.set(
			'segments',
			typeof overrides.segments === 'string'
				? overrides.segments
				: JSON.stringify(
						overrides.segments ?? [
							{ targetId: 'word-1', startMs: 0, endMs: 1000 },
							{ targetId: 'word-2', startMs: 1500, endMs: 2500 }
						]
				)
		);
	}
	formData.set('targetType', overrides.targetType ?? 'word');

	return new Request('http://localhost/api/audio/bulk', {
		method: 'POST',
		body: formData
	});
}

async function post(request = bulkRequest()) {
	return POST({ request, locals } as never);
}

beforeEach(() => {
	mocks.prisma.word.count.mockReset();
	mocks.prisma.exampleSentence.count.mockReset();
	mocks.saveAudio.mockReset();
	mocks.processAudioSegments.mockReset();

	mocks.prisma.word.count.mockResolvedValue(2);
	mocks.prisma.exampleSentence.count.mockResolvedValue(0);
	mocks.processAudioSegments.mockResolvedValue([
		{ buffer: Buffer.from('clip1'), durationSec: 1 },
		{ buffer: Buffer.from('clip2'), durationSec: 1 }
	]);
	let counter = 0;
	mocks.saveAudio.mockImplementation(async () => {
		counter += 1;
		return { filename: `clip${counter}.mp3`, publicUrl: `/audio/clip${counter}.mp3` };
	});
});

describe('POST /api/audio/bulk', () => {
	it('processes segments, writes files, and returns the urls without touching the target rows', async () => {
		const response = await post();

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			results: { targetId: string; targetType: string; audioUrl: string }[];
			skipped: unknown[];
		};
		expect(body.results).toHaveLength(2);
		expect(body.results[0]).toMatchObject({
			targetId: 'word-1',
			targetType: 'word',
			audioUrl: '/audio/clip1.mp3'
		});
		expect(body.results[1]).toMatchObject({
			targetId: 'word-2',
			targetType: 'word',
			audioUrl: '/audio/clip2.mp3'
		});
		expect(body.skipped).toEqual([]);
		expect(mocks.saveAudio).toHaveBeenCalledTimes(2);
	});

	it('rejects unsupported MIME types', async () => {
		await expect(
			post(
				bulkRequest({
					file: new File(['data'], 'song.flac', { type: 'audio/flac' })
				})
			)
		).rejects.toMatchObject({
			status: 415,
			body: { message: 'Unsupported audio type: audio/flac' }
		});
		expect(mocks.processAudioSegments).not.toHaveBeenCalled();
	});

	it('rejects files larger than the upload cap', async () => {
		const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.webm', {
			type: 'audio/webm'
		});

		await expect(post(bulkRequest({ file: big }))).rejects.toMatchObject({
			status: 413,
			body: { message: 'Audio file is too large.' }
		});
	});

	it('reports skipped segments when processed length is outside the allowed window', async () => {
		mocks.processAudioSegments.mockResolvedValue([
			{ buffer: Buffer.from('short'), durationSec: 0.05 },
			{ buffer: Buffer.from('clip2'), durationSec: 1 }
		]);

		const response = await post();
		const body = (await response.json()) as {
			results: unknown[];
			skipped: { targetId: string; reason: string }[];
		};

		expect(body.results).toHaveLength(1);
		expect(body.skipped).toHaveLength(1);
		expect(body.skipped[0].targetId).toBe('word-1');
		expect(body.skipped[0].reason).toMatch(/outside/);
	});

	it('rejects duplicate targets in a single batch', async () => {
		await expect(
			post(
				bulkRequest({
					segments: [
						{ targetId: 'word-1', startMs: 0, endMs: 1000 },
						{ targetId: 'word-1', startMs: 1500, endMs: 2500 }
					]
				})
			)
		).rejects.toMatchObject({
			status: 400,
			body: { message: expect.stringMatching(/appears more than once/) }
		});
	});

	it('rejects malformed segments JSON', async () => {
		await expect(post(bulkRequest({ segments: '{not-json' }))).rejects.toMatchObject({
			status: 400,
			body: { message: 'Segments JSON is invalid.' }
		});
	});

	it('routes mixed per-segment target types to the right tables and preserves them in results', async () => {
		mocks.prisma.word.count.mockResolvedValue(2);
		mocks.prisma.exampleSentence.count.mockResolvedValue(1);
		mocks.processAudioSegments.mockResolvedValue([
			{ buffer: Buffer.from('w'), durationSec: 1 },
			{ buffer: Buffer.from('p'), durationSec: 1 },
			{ buffer: Buffer.from('s'), durationSec: 1 }
		]);

		const response = await post(
			bulkRequest({
				segments: [
					{ targetType: 'word', targetId: 'word-1', startMs: 0, endMs: 1000 },
					{ targetType: 'word-plural', targetId: 'word-2', startMs: 0, endMs: 1000 },
					{ targetType: 'sentence', targetId: 'sent-1', startMs: 0, endMs: 1000 }
				]
			})
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			results: { targetId: string; targetType: string; audioUrl: string }[];
		};
		expect(body.results.map((r) => [r.targetId, r.targetType])).toEqual([
			['word-1', 'word'],
			['word-2', 'word-plural'],
			['sent-1', 'sentence']
		]);

		// word + word-plural are verified against the Word table, sentence against ExampleSentence.
		expect(mocks.prisma.word.count).toHaveBeenCalledWith({
			where: { id: { in: ['word-1', 'word-2'] } }
		});
		expect(mocks.prisma.exampleSentence.count).toHaveBeenCalledWith({
			where: { id: { in: ['sent-1'] } }
		});
		// A sentence target must never be looked up via the Word table.
		expect(mocks.prisma.word.count).not.toHaveBeenCalledWith({
			where: { id: { in: expect.arrayContaining(['sent-1']) } }
		});
	});

	it('returns 404 when a word/word-plural target does not exist', async () => {
		mocks.prisma.word.count.mockResolvedValue(1); // only one of the two word targets exists
		mocks.prisma.exampleSentence.count.mockResolvedValue(0);

		await expect(
			post(
				bulkRequest({
					segments: [
						{ targetType: 'word', targetId: 'word-1', startMs: 0, endMs: 1000 },
						{ targetType: 'word-plural', targetId: 'missing', startMs: 0, endMs: 1000 }
					]
				})
			)
		).rejects.toMatchObject({
			status: 404,
			body: { message: 'One or more words were not found.' }
		});
		expect(mocks.processAudioSegments).not.toHaveBeenCalled();
	});

	it('returns 404 when a sentence target does not exist', async () => {
		mocks.prisma.word.count.mockResolvedValue(1);
		mocks.prisma.exampleSentence.count.mockResolvedValue(0); // sentence target missing

		await expect(
			post(
				bulkRequest({
					segments: [
						{ targetType: 'word', targetId: 'word-1', startMs: 0, endMs: 1000 },
						{ targetType: 'sentence', targetId: 'missing-sentence', startMs: 0, endMs: 1000 }
					]
				})
			)
		).rejects.toMatchObject({
			status: 404,
			body: { message: 'One or more sentences were not found.' }
		});
		expect(mocks.processAudioSegments).not.toHaveBeenCalled();
	});
});
