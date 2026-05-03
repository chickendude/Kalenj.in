import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

const ffmpegPath =
	typeof ffmpegStatic === 'string' && ffmpegStatic.length > 0 ? ffmpegStatic : 'ffmpeg';

const FFMPEG_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 256 * 1024 * 1024;

// Trim silence at both ends. Second pass "areverse" trick handles end trimming.
// RMS detection averages over a short window so soft vowel onsets aren't clipped;
// -55 dB threshold leaves room for quiet attacks.
const SILENCE_REMOVE_CHAIN =
	'silenceremove=start_periods=1:start_silence=0.15:start_threshold=-55dB:detection=rms,' +
	'areverse,' +
	'silenceremove=start_periods=1:start_silence=0.15:start_threshold=-55dB:detection=rms,' +
	'areverse';

function runFfmpeg(args: string[]): Promise<{ stdout: Buffer; stderr: string }> {
	return new Promise((resolvePromise, rejectPromise) => {
		execFile(
			ffmpegPath,
			args,
			{ encoding: 'buffer', timeout: FFMPEG_TIMEOUT_MS, maxBuffer: MAX_BUFFER },
			(err, stdout, stderr) => {
				const stderrText = stderr ? stderr.toString('utf8') : '';
				if (err) {
					const msg = err.message || 'ffmpeg failed';
					rejectPromise(new Error(`${msg}\n${stderrText}`));
					return;
				}
				resolvePromise({ stdout: stdout as Buffer, stderr: stderrText });
			}
		);
	});
}

function parseMaxVolumeDb(stderr: string): number | null {
	const match = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
	if (!match) return null;
	const value = Number(match[1]);
	return Number.isFinite(value) ? value : null;
}

function parseDurationSeconds(stderr: string): number | null {
	const match = stderr.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g);
	if (!match || match.length === 0) return null;
	const last = match[match.length - 1].replace('time=', '');
	const parts = last.split(':');
	if (parts.length !== 3) return null;
	const hours = Number(parts[0]);
	const minutes = Number(parts[1]);
	const seconds = Number(parts[2]);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
		return null;
	}
	return hours * 3600 + minutes * 60 + seconds;
}

function clampGain(gainDb: number): number {
	if (!Number.isFinite(gainDb)) return 0;
	if (gainDb > 20) return 20;
	if (gainDb < -20) return -20;
	return gainDb;
}

type SegmentRange = {
	startSec: number;
	endSec: number;
};

function segmentInputArgs(range: SegmentRange | undefined, inputPath: string): string[] {
	if (!range) return ['-i', inputPath];
	const startSec = Math.max(0, range.startSec);
	const endSec = Math.max(startSec, range.endSec);
	return ['-ss', startSec.toFixed(3), '-to', endSec.toFixed(3), '-i', inputPath];
}

async function processFromPath(
	inputPath: string,
	outputPath: string,
	range?: SegmentRange
): Promise<{ outputDurationSec: number | null }> {
	const detectFilter = `${SILENCE_REMOVE_CHAIN},volumedetect`;
	const { stderr: detectStderr } = await runFfmpeg([
		'-nostdin',
		'-hide_banner',
		'-loglevel',
		'info',
		'-y',
		...segmentInputArgs(range, inputPath),
		'-af',
		detectFilter,
		'-f',
		'null',
		'-'
	]);

	const maxVolume = parseMaxVolumeDb(detectStderr);
	const gainDb = maxVolume === null ? 0 : clampGain(-1 - maxVolume);
	const outputDurationSec = parseDurationSeconds(detectStderr);

	const encodeFilter =
		gainDb === 0
			? SILENCE_REMOVE_CHAIN
			: `${SILENCE_REMOVE_CHAIN},volume=${gainDb.toFixed(2)}dB`;

	await runFfmpeg([
		'-nostdin',
		'-hide_banner',
		'-loglevel',
		'error',
		'-y',
		...segmentInputArgs(range, inputPath),
		'-af',
		encodeFilter,
		'-ac',
		'1',
		'-ar',
		'44100',
		'-b:a',
		'128k',
		'-codec:a',
		'libmp3lame',
		'-f',
		'mp3',
		outputPath
	]);

	return { outputDurationSec };
}

export async function processAudio(input: Buffer): Promise<Buffer> {
	if (!Buffer.isBuffer(input) || input.length === 0) {
		throw new Error('Empty audio input');
	}

	const workDir = await mkdtemp(join(tmpdir(), 'kalenjin-audio-'));
	const inputPath = join(workDir, 'input.bin');
	const outputPath = join(workDir, 'output.mp3');

	try {
		await writeFile(inputPath, input);
		await processFromPath(inputPath, outputPath);
		return await readFile(outputPath);
	} finally {
		await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
	}
}

export type ProcessedSegment = {
	buffer: Buffer;
	durationSec: number | null;
};

export async function processAudioSegments(
	input: Buffer,
	ranges: SegmentRange[]
): Promise<ProcessedSegment[]> {
	if (!Buffer.isBuffer(input) || input.length === 0) {
		throw new Error('Empty audio input');
	}
	if (ranges.length === 0) return [];

	const workDir = await mkdtemp(join(tmpdir(), 'kalenjin-audio-'));
	const inputPath = join(workDir, 'input.bin');

	try {
		await writeFile(inputPath, input);

		const results: ProcessedSegment[] = [];
		for (let i = 0; i < ranges.length; i += 1) {
			const outputPath = join(workDir, `segment-${i}.mp3`);
			const { outputDurationSec } = await processFromPath(inputPath, outputPath, ranges[i]);
			const buffer = await readFile(outputPath);
			results.push({ buffer, durationSec: outputDurationSec });
		}
		return results;
	} finally {
		await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
	}
}
