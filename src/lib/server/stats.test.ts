import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const prisma = {
		word: {
			findFirst: vi.fn(),
			count: vi.fn()
		},
		exampleSentence: {
			findFirst: vi.fn(),
			count: vi.fn()
		},
		$queryRawUnsafe: vi.fn()
	};
	return { prisma };
});

vi.mock('$lib/server/prisma', () => ({ prisma: mocks.prisma }));

const {
	cumulativeCellValue,
	filterEmptyBucketIndices,
	getEffectiveChangeMetrics,
	loadStats,
	pickBucketForRange,
	rangeBounds,
	sourceChangeMetric
} = await import('./stats');
import type { MetricId, SeriesPoint } from './stats';

function utc(year: number, month: number, day: number, hour = 0): Date {
	return new Date(Date.UTC(year, month - 1, day, hour));
}

describe('pickBucketForRange', () => {
	it('uses daily buckets for ranges up to ~5 weeks', () => {
		expect(pickBucketForRange(utc(2026, 4, 1), utc(2026, 4, 8))).toBe('day');
		expect(pickBucketForRange(utc(2026, 4, 1), utc(2026, 5, 1))).toBe('day');
		expect(pickBucketForRange(utc(2026, 4, 1), utc(2026, 5, 6))).toBe('day');
	});

	it('rolls up to weekly when the range exceeds 35 days', () => {
		expect(pickBucketForRange(utc(2026, 4, 1), utc(2026, 5, 7))).toBe('week');
		expect(pickBucketForRange(utc(2026, 4, 1), utc(2026, 6, 24))).toBe('week');
	});

	it('rolls up to monthly when the range exceeds ~12 weeks', () => {
		expect(pickBucketForRange(utc(2026, 4, 1), utc(2026, 6, 25))).toBe('month');
		expect(pickBucketForRange(utc(2025, 4, 1), utc(2026, 4, 1))).toBe('month');
	});

	it('rolls up to yearly when the range exceeds 5 years', () => {
		expect(pickBucketForRange(utc(2020, 4, 1), utc(2026, 4, 2))).toBe('year');
		expect(pickBucketForRange(utc(2010, 1, 1), utc(2026, 1, 1))).toBe('year');
	});

	it('keeps monthly buckets right up to the 5-year threshold', () => {
		// Exactly 5 * 365 = 1825 days → still monthly.
		expect(pickBucketForRange(utc(2021, 4, 2), utc(2026, 4, 1))).toBe('month');
	});
});

describe('rangeBounds', () => {
	beforeEach(() => {
		mocks.prisma.word.findFirst.mockReset();
		mocks.prisma.exampleSentence.findFirst.mockReset();
	});

	it('returns the past 7 days ending tomorrow (inclusive of today)', async () => {
		const now = utc(2026, 5, 6, 14);
		const { from, to } = await rangeBounds('past7Days', now);
		expect(from).toEqual(utc(2026, 4, 30));
		expect(to).toEqual(utc(2026, 5, 7));
		expect((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)).toBe(7);
	});

	it('returns the past 30 days', async () => {
		const now = utc(2026, 5, 6, 14);
		const { from, to } = await rangeBounds('past30Days', now);
		expect(from).toEqual(utc(2026, 4, 7));
		expect(to).toEqual(utc(2026, 5, 7));
	});

	it('returns the past 365 days for pastYear', async () => {
		const now = utc(2026, 5, 6, 14);
		const { from, to } = await rangeBounds('pastYear', now);
		expect(from).toEqual(utc(2025, 5, 7));
		expect(to).toEqual(utc(2026, 5, 7));
	});

	it('aligns thisWeek to Monday (matching Postgres date_trunc(week))', async () => {
		// Wednesday May 6 → Monday May 4
		const wed = utc(2026, 5, 6, 9);
		const wedBounds = await rangeBounds('thisWeek', wed);
		expect(wedBounds.from).toEqual(utc(2026, 5, 4));
		expect(wedBounds.to).toEqual(utc(2026, 5, 7));

		// Sunday May 3 → previous Monday April 27 (Sunday belongs to the prior ISO week)
		const sun = utc(2026, 5, 3, 9);
		const sunBounds = await rangeBounds('thisWeek', sun);
		expect(sunBounds.from).toEqual(utc(2026, 4, 27));
		expect(sunBounds.to).toEqual(utc(2026, 5, 4));

		// Monday itself stays at start-of-day Monday
		const mon = utc(2026, 5, 4, 23);
		const monBounds = await rangeBounds('thisWeek', mon);
		expect(monBounds.from).toEqual(utc(2026, 5, 4));
	});

	it('aligns thisMonth to the 1st', async () => {
		const { from, to } = await rangeBounds('thisMonth', utc(2026, 5, 6));
		expect(from).toEqual(utc(2026, 5, 1));
		expect(to).toEqual(utc(2026, 5, 7));
	});

	it('aligns thisYear to January 1', async () => {
		const { from } = await rangeBounds('thisYear', utc(2026, 5, 6));
		expect(from).toEqual(utc(2026, 1, 1));
	});

	it('uses the earliest createdAt across words and sentences for allTime', async () => {
		mocks.prisma.word.findFirst.mockResolvedValue({ createdAt: utc(2024, 7, 12, 13) });
		mocks.prisma.exampleSentence.findFirst.mockResolvedValue({ createdAt: utc(2025, 1, 4) });
		const { from, to } = await rangeBounds('allTime', utc(2026, 5, 6));
		// Words came first → use July 12 2024 truncated to start of day
		expect(from).toEqual(utc(2024, 7, 12));
		expect(to).toEqual(utc(2026, 5, 7));
	});

	it('handles allTime when only one of the two tables has data', async () => {
		mocks.prisma.word.findFirst.mockResolvedValue(null);
		mocks.prisma.exampleSentence.findFirst.mockResolvedValue({ createdAt: utc(2025, 6, 1) });
		const { from } = await rangeBounds('allTime', utc(2026, 5, 6));
		expect(from).toEqual(utc(2025, 6, 1));
	});

	it('falls back to thisMonth when allTime has no data', async () => {
		mocks.prisma.word.findFirst.mockResolvedValue(null);
		mocks.prisma.exampleSentence.findFirst.mockResolvedValue(null);
		const { from, to } = await rangeBounds('allTime', utc(2026, 5, 6));
		expect(from).toEqual(utc(2026, 5, 1));
		expect(to).toEqual(utc(2026, 5, 7));
	});
});

describe('sourceChangeMetric / getEffectiveChangeMetrics', () => {
	it('maps each cumulative metric back to its source creation metric', () => {
		expect(sourceChangeMetric('cumulativeWords')).toBe('wordsCreated');
		expect(sourceChangeMetric('cumulativeSentences')).toBe('sentencesCreated');
		expect(sourceChangeMetric('cumulativeWordAudio')).toBe('wordAudioRecorded');
		expect(sourceChangeMetric('cumulativeSentenceAudio')).toBe('sentenceAudioRecorded');
	});

	it('maps creation metrics to themselves', () => {
		expect(sourceChangeMetric('wordsCreated')).toBe('wordsCreated');
		expect(sourceChangeMetric('sentencesCreated')).toBe('sentencesCreated');
		expect(sourceChangeMetric('wordAudioRecorded')).toBe('wordAudioRecorded');
		expect(sourceChangeMetric('sentenceAudioRecorded')).toBe('sentenceAudioRecorded');
	});

	it('deduplicates source metrics across visible metrics', () => {
		const result = getEffectiveChangeMetrics([
			'wordsCreated',
			'cumulativeWords',
			'sentencesCreated',
			'cumulativeSentences',
			'wordAudioRecorded',
			'cumulativeWordAudio'
		]);
		expect(result.sort()).toEqual(['sentencesCreated', 'wordAudioRecorded', 'wordsCreated']);
	});

	it('returns an empty list when no metrics are visible', () => {
		expect(getEffectiveChangeMetrics([])).toEqual([]);
	});

	it('reduces a cumulative-only selection to its underlying creation metric', () => {
		expect(getEffectiveChangeMetrics(['cumulativeWords'])).toEqual(['wordsCreated']);
	});
});

function makeSeries(
	wordsCreated: number[],
	sentencesCreated: number[],
	wordAudioRecorded: number[] = wordsCreated.map(() => 0),
	sentenceAudioRecorded: number[] = wordsCreated.map(() => 0)
): Record<MetricId, SeriesPoint[]> {
	const labels = wordsCreated.map((_, i) => `bucket-${i}`);
	let wordsRunning = 0;
	let sentencesRunning = 0;
	let wordAudioRunning = 0;
	let sentenceAudioRunning = 0;
	const cumulativeWords = wordsCreated.map((c) => {
		wordsRunning += c;
		return wordsRunning;
	});
	const cumulativeSentences = sentencesCreated.map((c) => {
		sentencesRunning += c;
		return sentencesRunning;
	});
	const cumulativeWordAudio = wordAudioRecorded.map((c) => {
		wordAudioRunning += c;
		return wordAudioRunning;
	});
	const cumulativeSentenceAudio = sentenceAudioRecorded.map((c) => {
		sentenceAudioRunning += c;
		return sentenceAudioRunning;
	});
	const toPoints = (counts: number[]): SeriesPoint[] =>
		counts.map((count, i) => ({ bucket: labels[i], count }));
	return {
		wordsCreated: toPoints(wordsCreated),
		sentencesCreated: toPoints(sentencesCreated),
		wordAudioRecorded: toPoints(wordAudioRecorded),
		sentenceAudioRecorded: toPoints(sentenceAudioRecorded),
		cumulativeWords: toPoints(cumulativeWords),
		cumulativeSentences: toPoints(cumulativeSentences),
		cumulativeWordAudio: toPoints(cumulativeWordAudio),
		cumulativeSentenceAudio: toPoints(cumulativeSentenceAudio)
	};
}

describe('filterEmptyBucketIndices', () => {
	it('returns indices where any effective change metric is non-zero', () => {
		const series = makeSeries([0, 3, 0, 1, 0], [0, 0, 5, 0, 0]);
		// Effective = both creation metrics
		const idx = filterEmptyBucketIndices(5, series, ['wordsCreated', 'sentencesCreated']);
		expect(idx).toEqual([1, 2, 3]);
	});

	it('respects a single visible metric', () => {
		const series = makeSeries([0, 3, 0, 1, 0], [0, 0, 5, 0, 0]);
		const idx = filterEmptyBucketIndices(5, series, ['wordsCreated']);
		expect(idx).toEqual([1, 3]);
	});

	it('includes audio activity metrics', () => {
		const series = makeSeries([0, 0, 0], [0, 0, 0], [0, 2, 0], [0, 0, 4]);
		const idx = filterEmptyBucketIndices(3, series, [
			'wordAudioRecorded',
			'sentenceAudioRecorded'
		]);
		expect(idx).toEqual([1, 2]);
	});

	it('returns no indices when no effective metrics are provided', () => {
		const series = makeSeries([1, 2, 3], [4, 5, 6]);
		expect(filterEmptyBucketIndices(3, series, [])).toEqual([]);
	});

	it('returns indices for cumulative-only selection (uses source metric)', () => {
		const series = makeSeries([0, 3, 0], [0, 0, 0]);
		// cumulativeWords → effective is wordsCreated → bucket 1 has activity
		const effective = getEffectiveChangeMetrics(['cumulativeWords']);
		expect(filterEmptyBucketIndices(3, series, effective)).toEqual([1]);
	});

	it('returns indices for cumulative audio selections using their source activity', () => {
		const series = makeSeries([0, 0, 0], [0, 0, 0], [0, 2, 0], [0, 0, 4]);
		const effective = getEffectiveChangeMetrics([
			'cumulativeWordAudio',
			'cumulativeSentenceAudio'
		]);
		expect(filterEmptyBucketIndices(3, series, effective)).toEqual([1, 2]);
	});
});

describe('cumulativeCellValue', () => {
	const series = makeSeries([2, 0, 5], [0, 1, 0]);
	// cumulativeWords: [2, 2, 7]
	// cumulativeSentences: [0, 1, 1]

	it('returns the count for non-cumulative metrics, including zero', () => {
		expect(cumulativeCellValue('wordsCreated', 0, series)).toBe(2);
		expect(cumulativeCellValue('wordsCreated', 1, series)).toBe(0);
		expect(cumulativeCellValue('sentencesCreated', 2, series)).toBe(0);
	});

	it('returns the cumulative value when its source metric had activity that bucket', () => {
		expect(cumulativeCellValue('cumulativeWords', 0, series)).toBe(2);
		expect(cumulativeCellValue('cumulativeWords', 2, series)).toBe(7);
	});

	it('returns null for a cumulative cell when the source metric was zero', () => {
		// wordsCreated[1] = 0 → cumulativeWords[1] should render blank, not 2
		expect(cumulativeCellValue('cumulativeWords', 1, series)).toBeNull();
		// sentencesCreated[0] = 0 → cumulativeSentences[0] blank
		expect(cumulativeCellValue('cumulativeSentences', 0, series)).toBeNull();
		expect(cumulativeCellValue('cumulativeSentences', 2, series)).toBeNull();
	});
});

describe('loadStats', () => {
	beforeEach(() => {
		mocks.prisma.word.count.mockReset();
		mocks.prisma.exampleSentence.count.mockReset();
		mocks.prisma.$queryRawUnsafe.mockReset();
	});

	it('aligns from to the bucket boundary so SQL date_trunc rows match labels', async () => {
		// Caller passes Apr 5 (Sat) but bucket is week → from should snap to Mar 30 (Mon).
		mocks.prisma.word.count.mockResolvedValue(0);
		mocks.prisma.exampleSentence.count.mockResolvedValue(0);
		mocks.prisma.$queryRawUnsafe.mockResolvedValue([]);

		const result = await loadStats('week', utc(2026, 4, 5), utc(2026, 4, 27));

		expect(result.from).toEqual(utc(2026, 3, 30));
		// Labels should also start at Mar 30 and step weekly
		expect(result.bucketLabels[0]).toBe(utc(2026, 3, 30).toISOString());
		expect(result.bucketLabels).toEqual([
			utc(2026, 3, 30).toISOString(),
			utc(2026, 4, 6).toISOString(),
			utc(2026, 4, 13).toISOString(),
			utc(2026, 4, 20).toISOString()
		]);
	});

	it('builds cumulative series by adding the baseline count to running totals', async () => {
		// Pretend 10 words existed before the range; then 1 + 2 + 0 created during.
		mocks.prisma.word.count.mockImplementation((args?: { where?: { createdAt?: { lt: Date } } }) => {
			if (args?.where?.createdAt?.lt) return Promise.resolve(10);
			return Promise.resolve(13);
		});
		mocks.prisma.exampleSentence.count.mockResolvedValue(0);
		mocks.prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
			if (sql.includes('"Word"') && sql.includes('createdAt')) {
				return [
					{ bucket: utc(2026, 4, 1), count: 1n },
					{ bucket: utc(2026, 4, 2), count: 2n }
				];
			}
			return [];
		});

		const result = await loadStats('day', utc(2026, 4, 1), utc(2026, 4, 4));

		expect(result.series.wordsCreated.map((p) => p.count)).toEqual([1, 2, 0]);
		// Cumulative starts at baseline 10 + each bucket's creation
		expect(result.series.cumulativeWords.map((p) => p.count)).toEqual([11, 13, 13]);
	});

	it('exposes overview snapshot counts', async () => {
		mocks.prisma.word.count.mockImplementation(
			(args?: { where?: { createdAt?: { lt: Date }; audioUrl?: { not: null } } }) => {
				if (args?.where?.createdAt?.lt) return Promise.resolve(0); // baseline
				if (args?.where?.audioUrl) return Promise.resolve(7);
				return Promise.resolve(50);
			}
		);
		mocks.prisma.exampleSentence.count.mockImplementation(
			(args?: { where?: { createdAt?: { lt: Date }; audioUrl?: { not: null } } }) => {
				if (args?.where?.createdAt?.lt) return Promise.resolve(0);
				if (args?.where?.audioUrl) return Promise.resolve(3);
				return Promise.resolve(60);
			}
		);
		mocks.prisma.$queryRawUnsafe.mockResolvedValue([]);

		const result = await loadStats('day', utc(2026, 4, 1), utc(2026, 4, 2));

		expect(result.overview).toEqual({
			totalWords: 50,
			totalSentences: 60,
			wordsWithAudio: 7,
			sentencesWithAudio: 3
		});
	});
});
