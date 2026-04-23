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
const SILENCE_REMOVE_CHAIN =
	'silenceremove=start_periods=1:start_silence=0.1:start_threshold=-45dB:detection=peak,' +
	'areverse,' +
	'silenceremove=start_periods=1:start_silence=0.1:start_threshold=-45dB:detection=peak,' +
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

function clampGain(gainDb: number): number {
	if (!Number.isFinite(gainDb)) return 0;
	if (gainDb > 20) return 20;
	if (gainDb < -20) return -20;
	return gainDb;
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

		// Pass 1: trim + detect peak
		const detectFilter = `${SILENCE_REMOVE_CHAIN},volumedetect`;
		const { stderr: detectStderr } = await runFfmpeg([
			'-nostdin',
			'-hide_banner',
			'-loglevel',
			'info',
			'-y',
			'-i',
			inputPath,
			'-af',
			detectFilter,
			'-f',
			'null',
			'-'
		]);

		const maxVolume = parseMaxVolumeDb(detectStderr);
		const gainDb = maxVolume === null ? 0 : clampGain(-1 - maxVolume);

		// Pass 2: trim + apply gain + encode mono MP3
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
			'-i',
			inputPath,
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

		return await readFile(outputPath);
	} finally {
		await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
	}
}
